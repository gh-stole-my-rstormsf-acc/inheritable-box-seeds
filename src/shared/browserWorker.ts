const getPageProtocol = () => {
  if (typeof window === 'undefined') return '';
  return window.location.protocol;
};

export const shouldUseModuleWorker = (pageProtocol = getPageProtocol()) => pageProtocol !== 'file:';
