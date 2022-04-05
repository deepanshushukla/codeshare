import React, { useState, useEffect } from "react";

import { useParams, useHistory } from "react-router-dom";
import App from "./App";
import firebase from "firebase";

const AppContainer = () => {
  const [isNewSession, setIsNewSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const history = useHistory();
  const sessionId = useParams().sessionId;
  useEffect(() => {
    firebase
      .database()
      .ref(`live-sessions/${sessionId}`)
      .once("value", (snapshot) => {
        console.log(snapshot.exists(),'snapshot.exists()')
        if (!snapshot.exists()) {
          setIsNewSession(true);
        }
        setSessionChecked(true);
      });
  }, []);

  if (!sessionId) {
    history.push("/error/page");
    return null;
  }
  console.log('sessionChecked',sessionId, sessionChecked, isNewSession)

  if (!sessionChecked) {
    return null;
  }

  return (
    <>
      <App sessionId={sessionId} isNewSession={isNewSession} />
    </>
  );
};

export default AppContainer;
