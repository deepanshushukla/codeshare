import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import AppContainer from "./components/App/Appcontainer";
import Error from "./components/Error";
import AppMainPage from "./components/App/AppMainPage";
import reportWebVitals from "./reportWebVitals";
import firebase from "firebase/app";
import "firebase/database";
import "firebase/analytics";
import { firebaseConfig } from "./firebase-config.js";
import { BrowserRouter as Router, Route, Redirect } from "react-router-dom";
const RouteContainer = () => {
  return (
    <div>
      <Router>
        <Route exact path="/" component={AppMainPage} />

        <Route exact path="/code/:sessionId?" component={AppContainer} />
        <Route
          exact
          path="/:sessionId"
          render={(props) => (
            <Redirect to={`/code/${props.match.params.sessionId}/`} />
          )}
        />
        <Route path="/error/page" component={Error} />
      </Router>
    </div>
  );
};
firebase.initializeApp(firebaseConfig);
if (process.env.REACT_APP_ENV === "prod") {
  firebase.analytics();
}
ReactDOM.render(<RouteContainer />, document.getElementById("root"));

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
