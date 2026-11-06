(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  var React = SDK.React;
  var Card = SDK.components.Card;
  var CardContent = SDK.components.CardContent;

  function HackerTubePage() {
    return React.createElement(
      Card,
      null,
      React.createElement(
        CardContent,
        null,
        React.createElement("h1", null, "HackerTube")
      )
    );
  }

  window.__HERMES_PLUGINS__.register("hackertube", HackerTubePage);
})();
