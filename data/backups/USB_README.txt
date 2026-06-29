耀聖藥局排班系統 — USB 資料包說明
================================

此 USB 只帶「資料」，程式碼請到分店用 Git 下載：

  git clone -b deploy/local-production https://github.com/takeyamayiusan-del/Pharmacy-Scheduling-System.git

USB 內容
--------
  yaosheng-local-YYYY-MM-DD.sql   本機資料庫完整備份（員工、班表、申請等）
  USB_README.txt                  本說明

分店還原步驟（摘要）
--------------------
  1. 完成 SOP 步驟 1～8（Node、Docker、git clone、supabase start）
  2. 全新庫已建立後，還原 SQL：

     Get-Content "E:\yaosheng-local-YYYY-MM-DD.sql" -Raw -Encoding UTF8 |
       docker exec -i supabase_db_yaosheng-pharmacy psql -U postgres -d postgres

  3. 繼續 SOP：.env.local、npm run build、Tailscale

注意
----
  - 不要複製 node_modules、.next、.env.local
  - Vercel 雲端資料與此 SQL 備份是兩套獨立資料
