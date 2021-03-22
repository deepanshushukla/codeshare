import React from 'react';
const HtmlContext = React.createContext({
  iframeSrc: '',

  html: '',

  css: '',

  js: '',
});
export const HtmlContextProvider = HtmlContext.Provider;
export default HtmlContext;
