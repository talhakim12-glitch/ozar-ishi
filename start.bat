@echo off
echo.
echo  ======================================
echo   עוזר אישי - סוכן ביטוח
echo  ======================================
echo.
echo  מתקין תלויות...
call npm install
echo.
echo  מפעיל את האפליקציה...
echo.
start http://localhost:3000
node server.js
pause
