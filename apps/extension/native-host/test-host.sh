#!/bin/bash
# Minimal native messaging host - echoes first message back
read_len() {
    local len=""
    for i in 1 2 3 4; do
        local c=$(dd bs=1 count=1 2>/dev/null | od -An -tx1 | tr -d ' ')
        len="${len}${c}"
    done
    echo $((16#${len}))
}

while true; do
    len=$(read_len)
    if [ -z "$len" ] || [ "$len" -eq 0 ]; then
        break
    fi
    msg=$(dd bs=1 count="$len" 2>/dev/null)
    # Echo back as progress
    response='{"version":1,"type":"progress","requestId":"test","stage":"testing","progress":50}'
    rlen=${#response}
    printf "\\x$(printf '%02x' $((rlen & 0xFF)))\\x$(printf '%02x' $(((rlen >> 8) & 0xFF)))\\x$(printf '%02x' $(((rlen >> 16) & 0xFF)))\\x$(printf '%02x' $(((rlen >> 24) & 0xFF)))"
    printf '%s' "$response"
done
