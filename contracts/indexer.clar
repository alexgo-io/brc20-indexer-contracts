;; indexer
;;
;; guardians validate tx submitted
;; verifies tx submitted was mined
;; updates the state (user balance, inscription usage)
;;
;; TODO: separation of logic and storage

(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-TX-NOT-MINED (err u1001))
(define-constant ERR-UNKNOWN-VALIDATOR (err u1002))
(define-constant ERR-PAUSED (err u1004))
(define-constant ERR-UKNOWN-RELAYER (err u1005))
(define-constant ERR-REQUIRED-VALIDATORS (err u1006))
(define-constant ERR-TX-ALREADY-INDEXED (err u1007))
(define-constant ERR-TOKEN-ALREADY-DEPLOYED (err u1008))
(define-constant ERR-MINT-GREATER-THAN-LIMIT (err u1009))
(define-constant ERR-MINT-FULL (err u1010))
(define-constant ERR-DOUBLE-SPEND (err u1011))
(define-constant ERR-FROM-BAL-MISMATCH (err u1012))
(define-constant ERR-TO-BAL-MISMATCH (err u1013))
(define-constant ERR-UKNOWN-TYPE (err u1014))
(define-constant ERR-VALIDATOR-ALREADY-REGISTERED (err u1015))

(define-constant DEPLOY u0)
(define-constant MINT u1)
(define-constant TRANSFER u2)

(define-constant MAX_UINT u340282366920938463463374607431768211455)
(define-constant ONE_8 u100000000)
(define-constant MAX_REQUIRED_VALIDATORS u10)

(define-constant structured-data-prefix 0x534950303138)
;; const domainHash = structuredDataHash(
;;   tupleCV({
;;     name: stringAsciiCV('ALEX BRC20 Indexer'),
;;     version: stringAsciiCV('0.0.1'),
;;     'chain-id': uintCV(new StacksMainnet().chainId) | uintCV(new StacksMocknet().chainId),
;;   }),
;; );
;; (define-constant message-domain 0x6d11cd301d11961e7cfeabd61e3f4da17f42f3d627362c8878aa9cbb5c532be2) ;;mainnet
(define-constant message-domain 0x84deb9a3b41b870d85819000deefa999f43b1bf2c3d80c3ea19d4b83b7b10fbc) ;; testnet

(define-data-var contract-owner principal tx-sender)
(define-map approved-relayers principal bool)

(define-data-var is-paused bool true)

(define-map validators principal (buff 33))
(define-data-var validator-count uint u0)
(define-data-var required-validators uint MAX_UINT)

(define-map tx-indexed (buff 32) bool)
(define-map tx-validated-by { tx-hash: (buff 32), validator: principal } bool)

;; tracks user balance by tick
(define-map user-balance { user: (buff 128), tick: (string-utf8 4) } uint)

;; tracks tick info
(define-map tick-info (string-utf8 4) { max: uint, lim: uint })
(define-map tick-minted (string-utf8 4) uint)

(define-map bitcoin-tx-mined (buff 4096) bool)

(define-data-var tx-hash-to-iter (buff 32) 0x)

;; governance functions

(define-public (set-paused (paused bool))
  (begin
    (try! (check-is-owner))
    (ok (var-set is-paused paused))
  )
)

(define-public (add-validator (validator-pubkey (buff 33)) (validator principal))
	(begin
        (try! (check-is-owner))
		(asserts! (is-none (map-get? validators validator)) ERR-VALIDATOR-ALREADY-REGISTERED)
		(map-set validators validator validator-pubkey)
        (var-set validator-count (+ u1 (var-get validator-count)))
		(ok (var-get validator-count))
	)
)

(define-public (remove-validator (validator principal))
    (begin
        (try! (check-is-owner))
        (asserts! (is-some (map-get? validators validator)) ERR-UNKNOWN-VALIDATOR)
        (map-delete validators validator)
        (var-set validator-count (- (var-get validator-count) u1))
        (ok (var-get validator-count))
    )
)

(define-public (approve-relayer (relayer principal) (approved bool))
    (begin
        (try! (check-is-owner))
        (ok (map-set approved-relayers relayer approved))
    )
)

(define-public (set-required-validators (new-required-validators uint))
    (begin
        (try! (check-is-owner))
        (asserts! (< new-required-validators MAX_REQUIRED_VALIDATORS) ERR-REQUIRED-VALIDATORS)
        (ok (var-set required-validators new-required-validators))
    )
)

(define-public (set-contract-owner (owner principal))
    (begin 
        (try! (check-is-owner))
        (ok (var-set contract-owner owner))
    )
)

(define-public (set-user-balance (user (buff 128)) (tick (string-utf8 4)) (amt uint))
    (begin 
        (try! (check-is-owner))
        (ok (map-set user-balance { user: user, tick: tick } amt))
    )
)

(define-public (set-tick-info (tick (string-utf8 4)) (max uint) (lim uint))
    (begin 
        (try! (check-is-owner))
        (ok (map-set tick-info tick { max: max, lim: lim }))
    )
)

;; read-only functions

(define-read-only (get-contract-owner)
    (var-get contract-owner)
)

(define-read-only (get-validator-or-fail (validator principal))
	(ok (unwrap! (map-get? validators validator) ERR-UNKNOWN-VALIDATOR))
)

(define-read-only (get-required-validators)
    (var-get required-validators)
)

(define-read-only (hash-tx (tx { bitcoin-tx: (buff 4096), type: uint, tick: (string-utf8 4), max: uint, lim: uint, amt: uint, from: (buff 128), to: (buff 128), from-bal: uint, to-bal: uint } ))
	(sha256 (default-to 0x (to-consensus-buff? tx)))
)

(define-read-only (get-paused)
    (var-get is-paused)
)

(define-read-only (get-user-balance-or-default (user (buff 128)) (tick (string-utf8 4)))
    (default-to u0 (map-get? user-balance { user: user, tick: tick }))
)

(define-read-only (get-tick-info-or-default (tick (string-utf8 4)))
    (default-to { max: u0, lim: u0 } (map-get? tick-info tick))
)

(define-read-only (get-tick-minted-or-default (tick (string-utf8 4)))
    (default-to u0 (map-get? tick-minted tick))
)

(define-read-only (get-bitcoin-tx-mined-or-default (bitcoin-tx (buff 4096)))
    (default-to false (map-get? bitcoin-tx-mined bitcoin-tx))
)

(define-read-only (validate-tx (tx-hash (buff 32)) (signature-pack { signer: principal, tx-hash: (buff 32), signature: (buff 65)}))
    (ok true)
)

(define-read-only (verify-mined (tx (buff 4096)) (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint }))
    (contract-call? .clarity-bitcoin was-segwit-tx-mined? block tx proof)
)

;; external functions

(define-public (index-tx-many  
    (bitcoin-tx (buff 4096)) (block { header: (buff 80), height: uint }) (proof { tx-index: uint, hashes: (list 14 (buff 32)), tree-depth: uint })
    (tx-many (list 130 
    { 
        tx: { bitcoin-tx: (buff 4096), type: uint, tick: (string-utf8 4), max: uint, lim: uint, amt: uint, from: (buff 128), to: (buff 128), from-bal: uint, to-bal: uint }, 
        signature-packs: (list 10 { signer: principal, tx-hash: (buff 32), signature: (buff 65) }) 
    }))
    )
    (begin 
        (asserts! (not (var-get is-paused)) ERR-PAUSED)
        (asserts! (is-some (map-get? approved-relayers tx-sender)) ERR-UKNOWN-RELAYER)
        (and (is-none (map-get? bitcoin-tx-mined bitcoin-tx)) (try! (verify-mined bitcoin-tx block proof)))
        (map-set bitcoin-tx-mined bitcoin-tx true)
        (fold index-tx-iter tx-many (ok true))
    )
)

;; internal functions

(define-private (validate-signature-iter
    (signature-pack { signer: principal, tx-hash: (buff 32), signature: (buff 65)})
    (previous-response (response bool uint))
    )
    (match previous-response
        prev-ok
        (validate-tx (var-get tx-hash-to-iter) signature-pack)
        prev-err
        previous-response
    )
)

(define-private (index-tx-iter
    (signed-tx 
    { 
        tx: { bitcoin-tx: (buff 4096), type: uint, tick: (string-utf8 4), max: uint, lim: uint, amt: uint, from: (buff 128), to: (buff 128), from-bal: uint, to-bal: uint }, 
        signature-packs: (list 10 { signer: principal, tx-hash: (buff 32), signature: (buff 65)}) 
    })
    (previous-response (response bool uint)))
        (match previous-response
        prev-ok
        (let
        (
            (tx (get tx signed-tx))
            (signature-packs (get signature-packs signed-tx))
            (tx-hash (hash-tx tx))
        )
        (asserts! (get-bitcoin-tx-mined-or-default (get bitcoin-tx tx)) ERR-TX-NOT-MINED)
        (asserts! (>= (len signature-packs) (var-get required-validators)) ERR-REQUIRED-VALIDATORS)
        (asserts! (is-none (map-get? tx-indexed tx-hash)) ERR-TX-ALREADY-INDEXED)
        (var-set tx-hash-to-iter tx-hash)
        (try! (fold validate-signature-iter signature-packs (ok true)))
        
        (if (is-eq (get type tx) u0)
            (begin 
                (asserts! (is-none (map-get? tick-info (get tick tx))) ERR-TOKEN-ALREADY-DEPLOYED)
                (ok (map-set tick-info (get tick tx) { max: (get max tx), lim: (get lim tx) }))
            )
            (if (is-eq (get type tx) u1)
                (let
                    ( 
                        (info (get-tick-info-or-default (get tick tx)))
                        (minted (get-tick-minted-or-default (get tick tx)))
                    )
                    (asserts! (<= (get amt tx) (get lim info)) ERR-MINT-GREATER-THAN-LIMIT)
                    (asserts! (<= (+ minted (get amt tx)) (get max info)) ERR-MINT-FULL)
                    (ok (map-set tick-minted (get tick tx) (+ minted (get amt tx))))
                )
                (if (is-eq (get type tx) u2)
                    (let 
                        (
                            (from-bal-key { user: (get from tx), tick: (get tick tx) })
                            (to-bal-key { user: (get to tx), tick: (get tick tx) })
                            (from-bal-indexed (and (is-none (map-get? user-balance from-bal-key)) (map-set user-balance from-bal-key (get from-bal tx))))
                            (to-bal-indexed (and (is-none (map-get? user-balance to-bal-key)) (map-set user-balance to-bal-key (get to-bal tx))))
                            (from-bal (get-user-balance-or-default (get user from-bal-key) (get tick from-bal-key)))
                            (to-bal (get-user-balance-or-default (get user to-bal-key) (get tick to-bal-key)))
                        )
                        (asserts! (<= (get amt tx) from-bal) ERR-DOUBLE-SPEND)
                        (asserts! (is-eq from-bal (get from-bal tx)) ERR-FROM-BAL-MISMATCH)
                        (asserts! (is-eq to-bal (get to-bal tx)) ERR-TO-BAL-MISMATCH)
                        (map-set user-balance from-bal-key (- from-bal (get amt tx)))
                        (ok (map-set user-balance to-bal-key (+ to-bal (get amt tx))))
                    )
                    ERR-UKNOWN-TYPE
                )
            )
        )
        )
        prev-err
        previous-response
    )
)

(define-private (check-is-owner)
    (ok (asserts! (is-eq (var-get contract-owner) tx-sender) ERR-NOT-AUTHORIZED))
)