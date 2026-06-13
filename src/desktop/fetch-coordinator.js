export function createFetchCoordinator() {
  let currentController = null;

  return {
    start() {
      currentController?.abort();
      const controller = new AbortController();
      currentController = controller;
      return controller;
    },
    cancel() {
      currentController?.abort();
    },
    finish(controller) {
      if (currentController === controller) currentController = null;
    },
    hasActiveFetch() {
      return currentController !== null;
    },
  };
}
