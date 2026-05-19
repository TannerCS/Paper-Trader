import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow, PhysicalPosition, PhysicalSize } from "@tauri-apps/api/window";
import { windowStateRepository } from "../../data/preferences/windowStateRepository";

export function WindowStatePersistence() {
  useEffect(() => {
    if (!isTauri()) {
      return;
    }

    const appWindow = getCurrentWindow();
    let disposed = false;
    let saveTimer: number | null = null;
    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;

    void windowStateRepository.getWindowState().then(async (storedState) => {
      if (!storedState || disposed) {
        return;
      }

      if (storedState.x !== undefined && storedState.y !== undefined) {
        await appWindow.setPosition(new PhysicalPosition(storedState.x, storedState.y)).catch(() => undefined);
      }

      await appWindow.setSize(new PhysicalSize(storedState.width, storedState.height)).catch(() => undefined);

      if (storedState.maximized) {
        await appWindow.maximize().catch(() => undefined);
      }
    });

    void appWindow.onResized(() => scheduleSave()).then((unlisten) => {
      unlistenResize = unlisten;
    });
    void appWindow.onMoved(() => scheduleSave()).then((unlisten) => {
      unlistenMove = unlisten;
    });
    void appWindow.onCloseRequested(() => {
      void saveWindowState();
    }).then((unlisten) => {
      unlistenClose = unlisten;
    });

    function scheduleSave() {
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
      }

      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        void saveWindowState();
      }, 500);
    }

    async function saveWindowState() {
      if (disposed) {
        return;
      }

      const [size, position, maximized, minimized] = await Promise.all([
        appWindow.innerSize(),
        appWindow.innerPosition().catch(() => null),
        appWindow.isMaximized(),
        appWindow.isMinimized(),
      ]);

      if (minimized) {
        return;
      }

      await windowStateRepository.saveWindowState({
        width: size.width,
        height: size.height,
        x: position?.x,
        y: position?.y,
        maximized,
      });
    }

    return () => {
      disposed = true;
      if (saveTimer !== null) {
        window.clearTimeout(saveTimer);
        saveTimer = null;
      }
      unlistenResize?.();
      unlistenMove?.();
      unlistenClose?.();
    };
  }, []);

  return null;
}
