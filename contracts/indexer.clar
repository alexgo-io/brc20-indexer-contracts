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
(define-constant err-available-not-enough (err u1008))
(define-constant err-transaction-not-mined (err u1009))
(define-constant err-tick-exists (err u1010))
(define-constant err-tick-not-exists (err u1011))
(define-constant err-mint-exceeds-lim (err u1012))
(define-constant err-mint-max-reached (err u1013))

(define-constant DEPLOY u0)
(define-constant MINT u1)
(define-constant TRANSFER u2)

;; maps inscription (txid without 'i0') to its data
(define-map inscriptions 
    (buff 32)
    {
        owner: (buff 128),
        used: bool,
        op: (string-utf8 8),
        tick: (string-utf8 4),
        amt: uint
    }
)

;; tracks user balance by tick
(define-map user-balance 
    {
        user: (buff 128),
        tick: (string-utf8 4)
    }
    { 
        transferrable: uint,
        available: uint
    }
)

(define-map tick-info 
    (string-utf8 4)
    {
        max: uint,        
        lim: uint
    }
)
(define-map tick-minted (string-utf8 4) uint)

(define-read-only (validate-deploy-inscription (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (max uint) (lim uint))
    (let 
        (
            (tx-data (extract-tx-data tx left-pos right-pos))
            (json-hex (str-to-hex (deploy-to-str tick max lim)))
        )
        (asserts! (is-eq json-hex (get tx-data tx-data)) err-data-mismatch)
        (ok { txid: (get txid tx-data), owner: (get owner tx-data), op: "DEPLOY", tick: tick, max: max, lim: lim })
    )
)

(define-read-only (validate-mint-inscription (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint))
    (let 
        (
            (tx-data (extract-tx-data tx left-pos right-pos))
            (json-hex (str-to-hex (mint-to-str tick amt)))
        )
        (asserts! (is-eq json-hex (get tx-data tx-data)) err-data-mismatch)
        (ok { txid: (get txid tx-data), owner: (get owner tx-data), op: "MINT", tick: tick, amt: amt })
    )
)

;; validate tx submitted contains the purported brc20 op
;; TODO tx-data loc is hardcoded at 2nd element of first witnesses
;; TODO txid == inscription ID
(define-read-only (validate-transfer-inscription (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint))
    (let 
        (
            (tx-data (extract-tx-data tx left-pos right-pos))
            (json-hex (str-to-hex (transfer-to-str tick amt)))
        )
        (asserts! (is-eq json-hex (get tx-data tx-data)) err-data-mismatch)
        (ok { txid: (get txid tx-data), owner: (get owner tx-data), op: "TRANSFER", tick: tick, amt: amt })
    )
)

(define-read-only (verify-deploy 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (max uint) (lim uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (was-mined-bool (unwrap! (contract-call? .clarity-bitcoin was-segwit-tx-mined? block tx proof) err-transaction-not-mined))
            (was-mined (asserts! was-mined-bool err-transaction-not-mined))
        )
        (asserts! (is-none (map-get? tick-info tick)) err-tick-exists)        
        (validate-deploy-inscription tx left-pos right-pos tick max lim)
    )
)

;; TODO prevent front-running
(define-read-only (verify-mint 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (was-mined-bool (unwrap! (contract-call? .clarity-bitcoin was-segwit-tx-mined? block tx proof) err-transaction-not-mined))
            (was-mined (asserts! was-mined-bool err-transaction-not-mined))
            (validation-data (try! (validate-mint-inscription tx left-pos right-pos tick amt)))
            (info (unwrap! (map-get? tick-info tick) err-tick-not-exists))
            (minted (default-to u0 (map-get? tick-minted tick)))
            (from-balance (default-to { transferrable: u0, available: u0 } (map-get? user-balance { user: (get owner validation-data), tick: tick })))
        )
        (asserts! (>= (get lim info) amt) err-mint-exceeds-lim)
        (asserts! (>= (get max info) (+ amt minted)) err-mint-max-reached)
        (ok (merge validation-data { minted: (+ amt minted),  available: (+ (get available from-balance) amt) }))
    )
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
(define-read-only (verify-transferrable 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (was-mined-bool (unwrap! (contract-call? .clarity-bitcoin was-segwit-tx-mined? block tx proof) err-transaction-not-mined))
            (was-mined (asserts! was-mined-bool err-transaction-not-mined))
            (validation-data (try! (validate-transfer-inscription tx left-pos right-pos tick amt)))
            (from-balance (unwrap! (map-get? user-balance { user: (get owner validation-data), tick: tick }) err-available-not-enough))
        )
        (asserts! (>= (get available from-balance) amt) err-available-not-enough)
        (ok (merge validation-data { available: (- (get available from-balance) amt), transferrable: (+ (get transferrable from-balance) amt) }))
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
            (from-balance (unwrap! (map-get? user-balance { user: from, tick: (get tick inscription) }) err-available-not-enough))
            (to-balance (default-to { transferrable: u0, available: u0 } (map-get? user-balance { user: to, tick: (get tick inscription) })))
        )
        (asserts! (not (get used inscription)) err-inscription-already-used)
        (asserts! (is-eq txid inscription-txid) err-txid-mismatch)
        (asserts! (is-eq from (get owner inscription)) err-from-mismatch)
        (asserts! (is-eq to receiver-pubkey) err-to-mismatch)
        (asserts! (>= (get transferrable from-balance) (get amt inscription)) err-available-not-enough)

        (ok { inscription: inscription, from: from, to: to, tick: (get tick inscription), from-transferrable: (- (get transferrable from-balance) (get amt inscription)), to-available: (+ (get available to-balance) (get amt inscription)) })
    )
)

;; convert brc20 transfer into a json-string
;; TODO amt in fixed, then string must handle decimals
(define-read-only (deploy-to-str (tick (string-utf8 4)) (max uint) (lim uint))
    (concat 
        u"{\"p\":\"brc-20\",\"op\":\"deploy\"," 
    (concat 
        u"\"tick\":\""
    (concat 
        tick 
    (concat 
        u"\",\"max\":\"" 
    (concat 
        (int-to-utf8 max)        
    (concat 
        u"\",\"lim\":\"" 
    (concat 
        (int-to-utf8 lim) u"\"}"
    )))))))
)

(define-read-only (mint-to-str (tick (string-utf8 4)) (amt uint))
    (concat 
        u"{\"p\":\"brc-20\",\"op\":\"mint\"," 
    (concat 
        u"\"tick\":\""
    (concat 
        tick 
    (concat 
        u"\",\"amt\":\"" 
    (concat 
        (int-to-utf8 amt) u"\"}"
    )))))
)

;; convert brc20 transfer into a json-string
;; TODO amt in fixed, then string must handle decimals
(define-read-only (transfer-to-str (tick (string-utf8 4)) (amt uint))
    (concat 
        u"{\"p\":\"brc-20\",\"op\":\"transfer\"," 
    (concat 
        u"\"tick\":\""
    (concat 
        tick 
    (concat 
        u"\",\"amt\":\"" 
    (concat 
        (int-to-utf8 amt) u"\"}"
    )))))
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; add the newly created inscription to the map
(define-public (inscribe-deploy 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (max uint) (lim uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (verification-data (try! (verify-deploy tx left-pos right-pos tick max lim block proof)))
        )
        (asserts! (is-none (map-get? inscriptions (get txid verification-data))) err-inscription-exists)
        (map-set tick-info tick { max: max, lim: lim })
        (ok 
            (map-insert inscriptions 
                (get txid verification-data) 
                { owner: (get owner verification-data), op: "DEPLOY", tick: tick, max: max, lim: lim }
            )
        )
    )
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; add the newly created inscription to the map
(define-public (inscribe-mint 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (verification-data (try! (verify-mint tx left-pos right-pos tick amt block proof)))
            (from-balance (default-to { transferrable: u0, available: u0 } (map-get? user-balance { user: (get owner verification-data), tick: (get tick verification-data) })))
        )
        (asserts! (is-none (map-get? inscriptions (get txid verification-data))) err-inscription-exists)
        (map-set tick-minted tick (get minted verification-data))
        (map-set user-balance 
            { user: (get owner verification-data), tick: (get tick verification-data) } 
            (merge from-balance { available: (get available verification-data) })
        )
        (ok 
            (map-insert inscriptions 
                (get txid verification-data) 
                { owner: (get owner verification-data), op: "MINT", tick: tick, amt: amt }
            )
        )
    )
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; add the newly created inscription to the map
(define-public (inscribe-transfer 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 12 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (verification-data (try! (verify-transferrable tx left-pos right-pos tick amt block proof)))
        )
        (asserts! (is-none (map-get? inscriptions (get txid verification-data))) err-inscription-exists)
        (map-set user-balance 
            { user: (get owner verification-data), tick: (get tick verification-data) } 
            { transferrable: (get transferrable verification-data), available: (get available verification-data) }
        )
        (ok 
            (map-insert inscriptions 
                (get txid verification-data) 
                { owner: (get owner verification-data), used: false, op: "TRANSFER", tick: tick, amt: amt }
            )
        )
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

(define-private (str-to-hex (str (string-utf8 4096)))
    (let 
        (
            (str-to-buff (unwrap-panic (to-consensus-buff? str)))
        )
        (unwrap-panic (slice? str-to-buff u5 (len str-to-buff)))
    )
)

(define-private (extract-tx-data (tx (buff 4096)) (left-pos uint) (right-pos uint))
    (let 
        (
            (parsed-tx (unwrap-panic (contract-call? .clarity-bitcoin parse-wtx tx)))
        )
        { 
            txid: (contract-call? .clarity-bitcoin get-segwit-txid tx), 
            owner: (get scriptPubKey (unwrap-panic (element-at? (get outs parsed-tx) u0))), 
            tx-data: (unwrap-panic (slice? (unwrap-panic (element-at? (unwrap-panic (element-at? (get witnesses parsed-tx) u0)) u1)) left-pos right-pos)) 
        }
    )
)