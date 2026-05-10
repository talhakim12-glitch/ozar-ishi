@echo off
echo מכין קבצים להעברה...
set DEST=%USERPROFILE%\Desktop\עוזר-אישי-העברה

mkdir "%DEST%" 2>nul
xcopy /E /I /Y /EXCLUDE:exclude.txt "%~dp0" "%DEST%"

echo.
echo ✅ הקבצים מוכנים בתיקייה: %DEST%
echo העתק את התיקייה הזאת לדיסק-און-קי או לענן
pause
