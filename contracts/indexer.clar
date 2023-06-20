;; indexer
;;
;; verifies tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; updates the state (user balance, inscription usage)

(define-constant err-data-mismatch (err u1001))
(define-constant err-inscription-exists (err u1002))
(define-constant err-inscription-not-exists (err u1003))
(define-constant err-inscription-already-used (err u1004))
(define-constant err-txid-mismatch (err u1005))
(define-constant err-from-mismatch (err u1006))
(define-constant err-to-mismatch (err u1007))
(define-constant err-balance-not-enough (err u1008))
(define-constant err-transaction-not-mined (err u1009))

(define-constant DEPLOY u0)
(define-constant MINT u1)
(define-constant TRANSFER u2)

;; maps inscription (txid without 'i0') to its data
(define-map inscriptions 
    (buff 32)
    {
        owner: (buff 128),
        used: bool,
        locktime: uint,
        op-code: uint,
        tick: (string-ascii 4),
        amt: uint
    }
)

;; tracks user balance by tick
(define-map user-balance 
    {
        user: (buff 128),
        tick: (string-ascii 4)
    }
    uint
)

;; validate tx submitted contains the purported brc20 op
;; TODO tx-data loc is hardcoded at 2nd element of first witnesses
;; TODO txid == inscription ID
(define-read-only (validate-inscription (tx (buff 4096)) (left-pos uint) (right-pos uint) (op-code uint) (tick (string-ascii 4)) (amt uint))
    (let 
        (
            (parsed-tx (try! (contract-call? .clarity-bitcoin parse-wtx tx)))
            (owner-pubkey (get scriptPubKey (unwrap-panic (element-at? (get outs parsed-tx) u0))))
            (txid (contract-call? .clarity-bitcoin get-segwit-txid tx))
            (json-str (json-to-str op-code tick amt))
            (tx-data (unwrap-panic (slice? (unwrap-panic (element-at? (unwrap-panic (element-at? (get witnesses parsed-tx) u0)) u1)) left-pos right-pos)))
            (json-buff (unwrap-panic (to-consensus-buff? json-str)))
            (json-hex (unwrap-panic (slice? json-buff u5 (len json-buff))))  
            ;; (json-hex (contract-call? .utils string-ascii-to-buff json-str))
        )
        (asserts! (is-eq json-hex tx-data) err-data-mismatch)
        (ok { txid: txid, content: { owner: owner-pubkey, used: false, locktime: (get locktime parsed-tx), op-code: op-code, tick: tick, amt: amt }})
    )
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
(define-read-only (verify-inscription 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (op-code uint) (tick (string-ascii 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (was-mined-bool (unwrap! (contract-call? .clarity-bitcoin was-segwit-tx-mined? block tx proof) err-transaction-not-mined))
            (was-mined (asserts! was-mined-bool err-transaction-not-mined))
        )
        (validate-inscription tx left-pos right-pos op-code tick amt)
    )
)

;; verifies tx submitted transfers a verified inscription (by txid without 'i0') from A to B
;; verifies tx submitted was mined
;; TODO inscription is hardcoded to be the first element of vins
;; TODO receiver is hardcoded to be the first element of vouts
(define-read-only (verify-transfer 
    (tx (buff 4096)) (txid (buff 32)) (from (buff 128)) (to (buff 128))
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (was-mined-bool (unwrap! (contract-call? .clarity-bitcoin was-segwit-tx-mined? block tx proof) err-transaction-not-mined))
            (was-mined (asserts! was-mined-bool err-transaction-not-mined))
            (parsed-tx (try! (contract-call? .clarity-bitcoin parse-wtx tx)))
            (inscription-txid (get hash (get outpoint (unwrap-panic (element-at? (get ins parsed-tx) u0)))))
            (receiver-pubkey (get scriptPubKey (unwrap-panic (element-at? (get outs parsed-tx) u0))))
            (inscription (unwrap! (map-get? inscriptions inscription-txid) err-inscription-not-exists))
            (from-balance (unwrap! (map-get? user-balance { user: from, tick: (get tick inscription) }) err-balance-not-enough))
            (to-balance (default-to u0 (map-get? user-balance { user: to, tick: (get tick inscription) })))
        )
        (asserts! (not (get used inscription)) err-inscription-already-used)
        (asserts! (is-eq txid inscription-txid) err-txid-mismatch)
        (asserts! (is-eq from (get owner inscription)) err-from-mismatch)
        (asserts! (is-eq to receiver-pubkey) err-to-mismatch)
        (asserts! (>= from-balance (get amt inscription)) err-balance-not-enough)

        (ok { inscription: inscription, from: from, to: to, tick: (get tick inscription), from-bal-after: (- from-balance (get amt inscription)), to-bal-after: (+ to-balance (get amt inscription)) })
    )

)

;; convert brc20 data into a json-string
;; TODO amt in fixed, then string must handle decimals
(define-read-only (json-to-str (op-code uint) (tick (string-ascii 4)) (amt uint))
    (concat 
        "{\"p\":\"brc-20\",\"op\":\"" 
    (concat 
        (if (is-eq op-code DEPLOY) "deploy" (if (is-eq op-code MINT) "mint" "transfer")) 
    (concat 
        "\",\"tick\":\""
    (concat 
        tick 
    (concat 
        "\",\"amt\":\"" 
    (concat 
        (int-to-ascii amt) "\"}"
    ))))))
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; add the newly created inscription to the map
(define-public (inscription-created 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (op-code uint) (tick (string-ascii 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (inscription-data (try! (verify-inscription tx left-pos right-pos op-code tick amt block proof)))
        )
        (asserts! (is-none (map-get? inscriptions (get txid inscription-data))) err-inscription-exists)
        (ok (map-insert inscriptions (get txid inscription-data) (get content inscription-data)))
    )
)

;; verifies tx submitted transfers a verified inscription (by txid without 'i0') from A to B
;; verifies tx submitted was mined
;; flag the inscription to used and update the user balance
(define-public (transfer 
    (tx (buff 4096)) (txid (buff 32)) (from (buff 128)) (to (buff 128))
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (transfer-data (try! (verify-transfer tx txid from to block proof)))            
        )
        (map-set inscriptions txid (merge (get inscription transfer-data) { owner: to, used: true }))
        (map-set user-balance { user: from, tick: (get tick transfer-data) } (get from-bal-after transfer-data))
        (map-set user-balance { user: to, tick: (get tick transfer-data) } (get to-bal-after transfer-data))
        (ok true)
    )
)