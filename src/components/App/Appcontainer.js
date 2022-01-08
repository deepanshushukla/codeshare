import React, { useState, useEffect } from 'react';

import { useParams, useHistory } from 'react-router-dom';
import App from './App';
import rand from 'random-key';
import firebase from 'firebase';

const AppContainer = () => {
  const [sessionId, setsessionId] = useState(useParams().sessionId);
  const [isNewSession, setIsNewSession] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const history = useHistory();

  useEffect(() => {
    if (!sessionId) {
      const randomSessionId = rand.generate(10);
      history.push({ pathname: `/code/${randomSessionId}` });
      setsessionId(randomSessionId);
      setSessionChecked(true);
      setIsNewSession(true);
    } else {
      firebase
        .database()
        .ref(`live-sessions/${sessionId}`)
        .once('value', (snapshot) => {
          if (snapshot.exists()) {
            setSessionChecked(true);
            return true;
          } else {
            history.push('/error/page');
            return false;
          }
        });
    }
  }, []);

  return (
    <>
      {sessionId && sessionChecked && (
        <App sessionId={sessionId} isNewSession={isNewSession} />
      )}
    </>
  );
};

export default AppContainer;
