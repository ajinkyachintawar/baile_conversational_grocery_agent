#!/usr/bin/env bash
# End-to-end test against the deployed Baile API.
# Usage: ./scripts/e2e_test.sh [base_url]
set -u

API="${1:-https://baile-conversational-grocery-agent.onrender.com}"
PASS=0
FAIL=0

say()  { printf "\n\033[1m== %s ==\033[0m\n" "$1"; }
ok()   { printf "\033[32mPASS\033[0m %s\n" "$1"; PASS=$((PASS+1)); }
bad()  { printf "\033[31mFAIL\033[0m %s\n" "$1"; FAIL=$((FAIL+1)); }

stream() {
  # POST a chat message, print timestamped SSE lines, capture to a temp file
  local session="$1" msg="$2" out="$3"
  curl -sN -X POST "$API/chat/stream" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$msg\", \"session_id\": \"$session\"}" \
    --max-time 120 | tee "$out" | while IFS= read -r line; do
      [ -n "$line" ] && echo "[$(date +%H:%M:%S)] ${line:0:160}"
  done
}

say "1. Health check"
T0=$(date +%s)
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$API/health")
T1=$(date +%s)
if [ "$CODE" = "200" ]; then ok "health 200 in $((T1-T0))s"; else bad "health returned $CODE"; fi

say "2. Create session"
SESSION=$(curl -s -X POST "$API/sessions" | python3 -c "import sys,json;print(json.load(sys.stdin)['session_id'])" 2>/dev/null)
if [ -n "$SESSION" ]; then ok "session $SESSION"; else bad "no session id"; exit 1; fi

say "3. Chat: product search"
OUT1=$(mktemp)
stream "$SESSION" "what milk do you have and how much is it?" "$OUT1"
grep -q '"type": "error"' "$OUT1" && bad "search chat emitted error: $(grep error "$OUT1" | head -1)" || true
grep -q '"type": "text"' "$OUT1" && ok "search chat produced text" || bad "search chat produced NO text"
grep -q '"type": "done"' "$OUT1" && ok "search chat completed (done event)" || bad "search chat never finished"

say "4. Chat: add to cart"
OUT2=$(mktemp)
stream "$SESSION" "add 2 milk and 1 bag of basmati rice to my cart" "$OUT2"
grep -q '"type": "error"' "$OUT2" && bad "cart chat emitted error: $(grep error "$OUT2" | head -1)" || true
grep -q 'manage_cart' "$OUT2" && ok "manage_cart tool was called" || bad "manage_cart never called"
grep -q '"type": "done"' "$OUT2" && ok "cart chat completed (done event)" || bad "cart chat never finished"

say "5. Cart has items WITH prices"
CART=$(curl -s "$API/cart/$SESSION")
echo "$CART" | python3 -c "
import sys, json
c = json.load(sys.stdin)
items = c.get('items', [])
assert items, 'cart is empty'
missing = [i['product_name'] for i in items if not i.get('price_eur')]
assert not missing, f'items missing price: {missing}'
print(f\"   cart: {len(items)} item(s), total €{c['total_eur']}\")
for i in items:
    print(f\"   - {i['product_name']} x{i['quantity']} @ €{i['price_eur']} ({i['store_id']})\")
" && ok "cart items all have prices" || bad "cart check failed"

say "6. Place order"
ORDER=$(curl -s -X POST "$API/orders/$SESSION" -H "Content-Type: application/json" -d '{}')
echo "$ORDER" | python3 -c "
import sys, json
o = json.load(sys.stdin)
assert o.get('status') == 'placed', o
print(f\"   order {o['order_id']} — €{o['total_eur']}\")
" && ok "order placed" || bad "order failed: $ORDER"

say "RESULT"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
