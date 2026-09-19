@echo off
title Hamsa Vidya - AI Wisdom & Quiz Companion
echo ================================================================
echo Starting Hamsa Vidya (हंस विद्या) Web Server...
echo ================================================================

REM Try node first, then agy-node fallback
where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.js
) else (
    echo Using Antigravity Node runtime...
    "C:\Users\sandy\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
)

pause
