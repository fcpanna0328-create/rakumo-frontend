#!/bin/bash
# 「落書きアート RAKUMO」フロントエンドを起動し、ブラウザで自動的に開くスクリプト
cd "$(dirname "$0")"
echo "=== フロントエンドサーバーを起動します ==="
echo "このウィンドウは閉じずに開いたままにしてください。"
echo ""
( sleep 2 && open "http://localhost:8080" ) &
python3 -m http.server 8080
