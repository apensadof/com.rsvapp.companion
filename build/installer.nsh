!macro customInstall
  ; Store the path of the installer
  StrCpy $0 $EXEPATH
!macroend

!macro customInstallFinish
  ; Schedule the installer for deletion after installation
  Delete /REBOOTOK $0
!macroend