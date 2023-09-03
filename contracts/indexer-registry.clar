;; indexer-registry
;;
;; store the state (user balance, inscription usage)
;;

(define-constant ERR-NOT-AUTHORIZED (err u1000))
(define-constant ERR-PAUSED (err u1001))
(define-constant ERR-TX-NOT-INDEXED (err u1002))

(define-data-var contract-owner principal tx-sender)
(define-map approved-operators principal bool)

(define-data-var is-paused bool true)

(define-map bitcoin-tx-mined (buff 4096) bool)
(define-map bitcoin-tx-indexed { tx-hash: (buff 4096), output: uint, offset: uint } { tick: (string-utf8 4), amt: uint, from: (buff 128), to: (buff 128) })

;; tracks user balance by tick
(define-map user-balance { user: (buff 128), tick: (string-utf8 4) } { balance: uint, up-to-block: uint })

;; governance functions

(define-public (set-paused (paused bool))
	(begin
		(try! (check-is-owner))
		(ok (var-set is-paused paused))))

(define-public (approve-operator (operator principal) (approved bool))
	(begin
		(try! (check-is-owner))
		(ok (map-set approved-operators operator approved))))

(define-public (set-contract-owner (owner principal))
	(begin
		(try! (check-is-owner))
		(ok (var-set contract-owner owner))))

;; read-only functions

(define-read-only (get-contract-owner)
	(var-get contract-owner))

(define-read-only (get-paused)
	(var-get is-paused))

(define-read-only (get-approved-operator-or-default (operator principal))
	(default-to false (map-get? approved-operators operator))
)

(define-read-only (get-user-balance-or-default (user (buff 128)) (tick (string-utf8 4)))
	(default-to { balance: u0, up-to-block: u0 } (map-get? user-balance { user: user, tick: tick })))

(define-read-only (get-bitcoin-tx-mined-or-default (tx (buff 4096)))
	(default-to false (map-get? bitcoin-tx-mined tx))
)

(define-read-only (get-bitcoin-tx-indexed-or-fail (bitcoin-tx (buff 4096)) (output uint) (offset uint))
	(ok (unwrap! (map-get? bitcoin-tx-indexed { tx-hash: bitcoin-tx, output: output, offset: offset }) ERR-TX-NOT-INDEXED)))

;; privileged functions

(define-public (set-user-balance (key { user: (buff 128), tick: (string-utf8 4) }) (value { balance: uint, up-to-block: uint }))
	(begin
		(try! (check-is-approved))
		(ok (map-set user-balance key value))))

(define-public (set-tx-mined (key (buff 4096)) (value bool))
	(begin 
		(try! (check-is-approved))
		(ok (map-set bitcoin-tx-mined key value))
	)
)

(define-public (set-tx-indexed (key { tx-hash: (buff 4096), output: uint, offset: uint }) (value { tick: (string-utf8 4), amt: uint, from: (buff 128), to: (buff 128) }))
	(begin 
		(try! (check-is-approved))
		(ok (map-set bitcoin-tx-indexed key value))
	)
)

;; internal functions

(define-private (check-is-approved)
	(ok (asserts! (or (get-approved-operator-or-default tx-sender) (is-ok (check-is-owner))) ERR-NOT-AUTHORIZED))
)

(define-private (check-is-owner)
	(ok (asserts! (is-eq (var-get contract-owner) tx-sender) ERR-NOT-AUTHORIZED)))
