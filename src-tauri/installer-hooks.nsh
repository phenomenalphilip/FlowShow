; FlowShow installer: check this computer against the minimum requirements before installing.
; (The same list is in the app: Help -> About -> System requirements, src/components/AppMenus.tsx)
; Below the minimum, the installer says what is short and asks whether to install anyway.
; Silent installs (updates) are not asked.

!macro NSIS_HOOK_PREINSTALL
  IfSilent flowshow_req_done

  StrCpy $R9 ""

  ; Windows 10 version 1809 (build 17763) or newer
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  IntCmp $R0 17763 flowshow_win_ok 0 flowshow_win_ok
    StrCpy $R9 "$R9$\r$\n  - Windows: build $R0 (needs Windows 10 version 1809 or newer)"
  flowshow_win_ok:

  ; Memory: 8 GB (a computer with 8 GB reports a little less, so 7 GB is accepted)
  System::Alloc 64
  Pop $R1
  System::Call "*$R1(i 64)"
  System::Call "kernel32::GlobalMemoryStatusEx(p R1)"
  System::Call "*$R1(i, i, l .R2)"
  System::Free $R1
  System::Int64Op $R2 / 1048576
  Pop $R2
  IntCmp $R2 7168 flowshow_ram_ok 0 flowshow_ram_ok
    System::Int64Op $R2 / 1024
    Pop $R3
    StrCpy $R9 "$R9$\r$\n  - Memory: about $R3 GB (needs 8 GB)"
  flowshow_ram_ok:

  ; Processor: 4 cores (counted as 4 logical processors)
  ReadEnvStr $R4 NUMBER_OF_PROCESSORS
  IntCmp $R4 4 flowshow_cpu_ok 0 flowshow_cpu_ok
    StrCpy $R9 "$R9$\r$\n  - Processor: $R4 cores (needs 4)"
  flowshow_cpu_ok:

  StrCmp $R9 "" flowshow_req_done
  MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "This computer is below what FlowShow needs to run properly:$\r$\n$R9$\r$\n$\r$\nMinimum: Windows 10 (64-bit) 1809 or newer, a 4-core processor, 8 GB of memory and DirectX 11 graphics.$\r$\nRecommended: 6 cores, 16 GB and a dedicated graphics card.$\r$\n$\r$\nFlowShow may run slowly or stutter on the screens. Install anyway?" IDYES flowshow_req_done
  Quit

  flowshow_req_done:
!macroend
