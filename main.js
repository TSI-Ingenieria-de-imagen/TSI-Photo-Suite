// const { app, BrowserWindow } = require('electron');
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require('path'); 
const url = require('url'); 
// require('electron-reload')(__dirname);  
const startServer = require('./api-Plantilla/src/apiRest');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    frame: true 
  });

  // mainWindow.setMenu(null);

  // mainWindow.loadURL('http://localhost:4400');

 
  const indexPath = path.join(__dirname, 'dist', 'front-plantilla-fotos', 'index.html');

  mainWindow.loadURL(
    url.format({
      pathname: indexPath,
      protocol: "file:",
      slashes: true,
    })
  );

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// app.on('ready', createWindow);

app.on('ready', () => {
  createWindow();
  startServer();  // Inicia tu API 
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// ipcMain.on('abrir-carpeta', (event, rutaArchivo) => {
//   shell.showItemInFolder(rutaArchivo);
// });

// ipcMain.on('recargar-ventana', () => {
//   if (mainWindow) {
//     mainWindow.reload();
//   }
// });

