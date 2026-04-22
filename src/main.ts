import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { updateElectronApp } from 'update-electron-app';
import { ChildProcess } from 'node:child_process';
import log from 'electron-log';
import * as pathUtils from './path-utils';
import * as environmentUtils from './environment-utils';
import * as backend from './backend';
import * as frontend from './frontend';
import * as constants from './constants';
import * as fileUtils from './file-utils';

updateElectronApp({
  updateInterval: '1 hour',
  logger: log,
}); // additional configuration options available

let server: ChildProcess;

app.whenReady().then(async () => {
  const migrationBridge = backend.prepareLegacyDesktopMigrationBridge(
    process.resourcesPath,
  );
  if (migrationBridge.shouldShowNotice && migrationBridge.noticeMarkerPath) {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Tracker Suite Migration',
      message:
        'This legacy Electron release now acts as a bridge to Tracker Suite.',
      detail: migrationBridge.exportPath
        ? `Your current database was exported to:\n${migrationBridge.exportPath}\n\nInstall the Tracker Suite desktop release to continue receiving updates and migrate your data automatically.`
        : 'Install the Tracker Suite desktop release to continue receiving updates and migrate your data automatically.',
      buttons: ['OK'],
      defaultId: 0,
    });
    backend.markLegacyDesktopMigrationNoticeShown(
      migrationBridge.noticeMarkerPath,
    );
  }

  const loadingWindow = frontend.createLoadingWindow();
  const logPath = join(
    pathUtils.getRootBackendFolderPath(
      environmentUtils.getEnvironment(),
      process.resourcesPath
    )
  );

  try {
    fileUtils.logToFile(logPath, 'Initializing backend server...', 'info');
    server = backend.startBackend(process.resourcesPath);
    
    // For spawn processes, the 'spawn' event fires synchronously or very quickly
    // Use a more reliable approach with error handling
    if (!server.pid) {
      const errorMsg = 'Failed to start backend: Process ID not assigned';
      console.error(errorMsg);
      fileUtils.logToFile(logPath, errorMsg, 'error');
      loadingWindow?.close();
      return;
    }

    fileUtils.logToFile(logPath, `Backend process started with PID: ${server.pid}`, 'info');

    try {
      if (
        await backend.checkIfPortIsOpen(
          constants.URLs,
          process.resourcesPath,
          loadingWindow,
          20,
          2000,
        )
      ) {
        loadingWindow?.close();
        frontend.createWindow(
          process.resourcesPath
        );
      }
    } catch (error) {
      const errorMessage = `Port check failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error(errorMessage);
      fileUtils.logToFile(logPath, errorMessage, 'error');
      loadingWindow?.close();
    }
  } catch (error) {
    const errorMessage = `Failed to initialize backend: ${error instanceof Error ? error.message : String(error)}\\nStack: ${error instanceof Error ? error.stack : ''}`;
    console.error(errorMessage);
    fileUtils.logToFile(logPath, errorMessage, 'error');
    loadingWindow?.close();
  }

  server.on('message', (message: string) => {
    console.log(`Message from child: ${message}`);
    fileUtils.logToFile(
      join(
        pathUtils.getRootBackendFolderPath(
          environmentUtils.getEnvironment(),
          process.resourcesPath
        )
      ),
      message,
      'info'
    );
  });

  server.on('error', (error: string) => {
    console.error(`Error from child: ${error}`);
    fileUtils.logToFile(
      join(
        pathUtils.getRootBackendFolderPath(
          environmentUtils.getEnvironment(),
          process.resourcesPath
        )
      ),
      error,
      'error'
    );
  });

  server.on('exit', (code: any, signal: any) => {
    console.log(`Child exited with code ${code} and signal ${signal}`);
    fileUtils.logToFile(
      join(
        pathUtils.getRootBackendFolderPath(
          environmentUtils.getEnvironment(),
          process.resourcesPath
        )
      ),
      `Child exited with code ${code} and signal ${signal}`,
      'error'
    );
  });
});

app.on('before-quit', async () => {
  // Perform any necessary cleanup here
  console.log('App is about to quit. Performing cleanup...');
  fileUtils.logToFile(
    join(
      pathUtils.getRootBackendFolderPath(
        environmentUtils.getEnvironment(),
        process.resourcesPath
      )
    ),
    'App is about to quit. Performing cleanup...',
    'info'
  );
  if (server) {
    server.kill();
  }

  // Wait for all asynchronous operations to complete
  await new Promise((resolve) => {
    setTimeout(resolve, 1000); // Adjust the timeout as needed
  });

  // Quit the app
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // createWindow();
  }
});
