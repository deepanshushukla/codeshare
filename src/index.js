import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './components/App/App';
import reportWebVitals from './reportWebVitals';
import Firebase from 'firebase';
import { firebaseConfig } from './firebase-config.js';
import { BrowserRouter as Router, Route } from 'react-router-dom';
const RouteContainer = () => {
  return (
    <div>
      <Router>
        <Route path="/:sessionId?" component={App} />
      </Router>
    </div>
  );
};
Firebase.initializeApp(firebaseConfig);
ReactDOM.render(
  <React.StrictMode>
    <RouteContainer />
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
