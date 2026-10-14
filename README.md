# Player Character Manager

This is the Visual Studio Code–ready Vite/React version of the Parchment
Ledger checkpoint.

## Requirements

- Visual Studio Code
- Node.js 22.13 or newer

## Start the app on Windows

1. Extract this project folder.
2. Open the folder in Visual Studio Code.
3. Choose **Terminal > New Terminal**.
4. Run:

   ```powershell
   npm.cmd install
   npm.cmd run dev
   ```

5. Ctrl-click the local address printed in the terminal, normally
   `http://localhost:5173`.

## Main files

- `src/App.tsx` contains the React screens, buttons, demo data, and behavior.
- `src/index.css` contains the parchment-ledger appearance and phone layout.
- `src/main.tsx` starts the React application.

The current data is demonstration data held in React state. It resets when the
page reloads. The planned next stage is persistent data through Google Apps
Script and Google Sheets.
