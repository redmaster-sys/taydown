@echo off
chcp 65001 >nul
title TayDown PRO v1.0 - Yuksek Hizli Indirme ve Medya Yoneticisi
cd /d "%~dp0"

echo [TayDown] 16-Kanal Turbo Motor ve YouTube/X Yakalayici baslatiliyor...
start "" /b node server.cjs

timeout /t 1 /nobreak >nul

where msedge >nul 2>nul
if %errorlevel%==0 (
  start "" msedge --app="http://127.0.0.1:4280" --window-size=1420,880
) else (
  start "" "http://127.0.0.1:4280"
)
