;; indexer
;;
;; verifies tx submitted contains the purported brc20 op
;; verifies tx submitted was mined
;; updates the state (user balance, inscription usage)

(define-constant err-data-mismatch (err u1001))

(define-read-only (verify-tx (tx (buff 1024)) (left-pos uint) (right-pos uint) (op-code uint) (tick (string-ascii 4)) (amt uint))
    (let 
        (
            (parsed-tx (try! (contract-call? .clarity-bitcoin parse-wtx tx)))
            (json-str (json-to-str op-code tick amt))
            (tx-data (unwrap-panic (slice? (unwrap-panic (element-at? (unwrap-panic (element-at? (get witnesses parsed-tx) u0)) u1)) left-pos right-pos)))
            (json-hex (contract-call? .utils string-ascii-to-buff json-str))
        )
        (asserts! (is-eq json-hex tx-data) err-data-mismatch)
        (ok json-str)
    )
)

(define-read-only (json-to-str (op-code uint) (tick (string-ascii 4)) (amt uint))
    (concat 
        "{\"p\":\"brc-20\",\"op\":\"" 
    (concat 
        (if (is-eq op-code u0) "deploy" (if (is-eq op-code u1) "mint" "transfer")) 
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