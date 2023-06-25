;; indexer
;;
;; verifies tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; updates the state (user balance, inscription usage)
;;
;; input requirements
;; - tx-data loc is at second element of first witnesses
;; - inscription is at the first element of vins
;; - receiver is at the first element of vouts
;;
;; TODO
;; - ensure the submitted tx is the oldest of what has yet to be submitted
;; - amt to be split between whole numbers and decimals
;; - separate data from logic (for future upgrades)
;; - add blockheight threashold to only consider those after initial data dump

(define-constant err-not-authorised (err u1000))
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

(define-data-var contract-owner principal tx-sender)

;; maps inscription (txid without 'i0') to its data
(define-map inscriptions 
    (buff 32)
    {
        owner: (buff 128),        
        op: (string-ascii 8),
        tick: (string-utf8 4),
        max: uint,
        lim: uint,
        amt: uint,        
        used: bool
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

;; tracks tick info
(define-map tick-info 
    (string-utf8 4)
    {
        max: uint,        
        lim: uint
    }
)
(define-map tick-minted (string-utf8 4) uint)

;; validate tx submitted contains the purported brc20 deploy
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

;; validate tx submitted contains the purported brc20 mint
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

;; validate tx submitted contains the purported brc20 transfer
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

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
(define-read-only (verify-deploy 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (max uint) (lim uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
(define-read-only (verify-mint 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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
(define-read-only (verify-transfer 
    (tx (buff 4096)) (txid (buff 32)) (from (buff 128)) (to (buff 128))
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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

;; convert brc20 deploy into a json-string
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

;; convert brc20 mint into a json-string
;; TODO amt in fixed, then string must handle decimals
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
;; add tick-info
;; add the newly created inscription to the map
(define-public (inscribe-deploy 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (max uint) (lim uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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
                { owner: (get owner verification-data), op: "DEPLOY", tick: tick, max: max, lim: lim, amt: u0, used: true }
            )
        )
    )
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; update tick-mined and user-balance
;; add the newly created inscription to the map
(define-public (inscribe-mint 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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
                { owner: (get owner verification-data), op: "MINT", tick: tick, max: u0, lim: u0, amt: amt, used: true }
            )
        )
    )
)

;; validates tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; update user-balance
;; add the newly created inscription to the map
(define-public (inscribe-transfer 
    (tx (buff 4096)) (left-pos uint) (right-pos uint) (tick (string-utf8 4)) (amt uint)
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
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
                { owner: (get owner verification-data), op: "TRANSFER", max: u0, lim: u0, tick: tick, amt: amt, used: false }
            )
        )
    )
)

;; verifies tx submitted transfers a verified inscription (by txid without 'i0') from A to B
;; verifies tx submitted was mined
;; flag the inscription to used and update the user balance
(define-public (transfer 
    (tx (buff 4096)) (txid (buff 32)) (from (buff 128)) (to (buff 128))
    (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
    )
    (let 
        (
            (verification-data (try! (verify-transfer tx txid from to block proof)))
            (tick (get tick verification-data))
            (from-balance (unwrap! (map-get? user-balance { user: from, tick: tick }) err-available-not-enough))
            (to-balance (default-to { transferrable: u0, available: u0 } (map-get? user-balance { user: to, tick: tick })))            
        )
        (map-set inscriptions txid (merge (get inscription verification-data) { owner: to, used: true }))
        (map-set user-balance { user: from, tick: tick } (merge from-balance { transferrable: (get from-transferrable verification-data) }))
        (map-set user-balance { user: to, tick: tick } (merge to-balance { available: (get to-available verification-data) }))
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

(define-private (check-is-owner)
    (ok (asserts! (is-eq (var-get contract-owner) tx-sender) err-not-authorised))
)

(define-read-only (get-contract-owner)
    (var-get contract-owner)
)

(define-public (set-contract-owner (owner principal))
    (begin 
        (try! (check-is-owner))
        (ok (var-set contract-owner owner))
    )
)

(define-public (set-user-balance (user (buff 128)) (tick (string-utf8 4)) (transferrable uint) (available uint))
    (begin 
        (try! (check-is-owner))
        (ok (map-set user-balance { user: user, tick: tick } { transferrable: transferrable, available: available }))
    )
)

(define-public (set-tick-info (tick (string-utf8 4)) (max uint) (lim uint))
    (begin 
        (try! (check-is-owner))
        (ok (map-set tick-info tick { max: max, lim: lim }))
    )
)