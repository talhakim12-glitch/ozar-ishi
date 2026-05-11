@echo off
echo מוסיף את העוזר האישי להפעלה אוטומטית...

set STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
set APP_DIR=%~dp0

:: יצירת קובץ הפעלה ב-Startup
echo @echo off > "%STARTUP%\ozar-ishi.bat"
echo cd /d "%APP_DIR%" >> "%STARTUP%\ozar-ishi.bat"
echo start http://localhost:3000 >> "%STARTUP%\ozar-ishi.bat"
echo start "" cmd /c "node server.js" >> "%STARTUP%\ozar-ishi.bat"

echo.
echo ✅ הושלם! מעכשיו העוזר יפעל אוטומטית בכל הפעלה.
echo    (ייפתח בדפדפן על localhost:3000)
echo.
pause
