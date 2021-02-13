import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import Firebase from 'firebase';
import rand from 'random-key';
import { ShrinkOutlined, ArrowsAltOutlined } from '@ant-design/icons';

//component
import Editor from '../Editor/Editor';
import Header from '../Header';

//utils
import firebaseRealTime from '../../utils/firebaseRealtime';
//cotext
import { UserContextProvider } from '../../context/userContext';
import { HtmlContextProvider } from '../../context/htmlContext';

//css
import './App.scss';

const App = ({ sessionId, isNewSession }) => {
  const [html, setHtml] = useState('');
  const [autoRun, setAutoRun] = useState(true);
  const [css, setCss] = useState('');
  const [js, setJs] = useState('');
  const [userId, setUserId] = useState(() => {
    if (sessionStorage.getItem('user')) {
      return JSON.parse(sessionStorage.getItem('user')).userId;
    }
    return;
  });
  const [users, setUsers] = useState([]);
  const [iframeSrc, setIframeSrc] = useState('');
  const [iframeOpen, setIframeOpen] = useState(true);
  let fireBaseRef = `live-sessions/${sessionId}`;
  const fireBaseDatabaseRef = Firebase.database().ref(fireBaseRef);
  const setValueFromSnapshot = (
    snapshot = { val: () => ({ html: '', css: '', js: '' }) }
  ) => {
    const { html = '', css = '', js = '', users = {} } = snapshot.val() || {};
    setHtml(html);
    setCss(css);
    setJs(js);
    setUsers(Object.values(users).filter((item) => item.status === 'online'));
  };
  useEffect(() => {
    fireBaseDatabaseRef
      .once('value')
      .then((snapshot) => {
        if (snapshot.exists()) {
          setValueFromSnapshot(snapshot);
        }
      })
      .catch((e) => {
        console.log(e);
      });
    fireBaseDatabaseRef.on('value', (snapshot) => {
      if (snapshot.exists()) {
        setValueFromSnapshot(snapshot);
      }
    });
  }, []);
  const getNewUserInSession = () => {
    const userId = rand.generate(3);
    setUserId(userId);
    let newUser = { name: `User_${userId}`, status: 'online', userId };
    sessionStorage.setItem('user', JSON.stringify(newUser));
    return { userId, newUser };
  };
  useEffect(() => {
    if (isNewSession) {
      const { userId, newUser } = getNewUserInSession();
      firebaseRealTime(fireBaseDatabaseRef).set({
        html,
        css,
        js,
        users: { [userId]: newUser },
      });
    }
    if (!isNewSession && !userId) {
      const { userId, newUser } = getNewUserInSession();
      firebaseRealTime(fireBaseDatabaseRef).update({
        [`users/${userId}`]: newUser,
      });
    }
    if (!isNewSession && userId) {
      firebaseRealTime(fireBaseDatabaseRef).update({
        [`users/${userId}/status`]: 'online',
      });
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (autoRun) {
        if (html || css || js) {
          refreshIframe();
        }
      } else {
        timeout && clearTimeout(timeout);
      }
    }, 300);
    return () => timeout && clearTimeout(timeout);
  }, [html, css, js, autoRun]);

  useEffect(() => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (userId) {
          firebaseRealTime(fireBaseDatabaseRef).update({
            [`users/${userId}/status`]: 'online',
          });
        }
      } else {
        if (document.visibilityState === 'hidden' && userId) {
          firebaseRealTime(fireBaseDatabaseRef).update({
            [`users/${userId}/status`]: 'away',
          });
        }
      }
    });
  });
  const refreshIframe = () => {
    setIframeSrc(`<html>
                        <body>${html}</body>
                         <style>${css}</style>
                         <script>${js}</script>
                     </html>`);
  };
  const saveToFireBase = (key, value) => {
    firebaseRealTime(Firebase.database().ref(fireBaseRef)).update({
      [key]: value,
    });
  };
  const onNameChange = (id, e) => {
    firebaseRealTime(Firebase.database().ref(fireBaseRef)).update({
      [`users/${id}/name`]: e.target.value,
    });
  };
  return (
    <>
      <UserContextProvider value={userId}>
        <HtmlContextProvider value={iframeSrc}>
          <Header
            users={users}
            onNameChange={onNameChange}
            autoRun={autoRun}
            refreshIframe={refreshIframe}
            setAutoRun={setAutoRun}
          />
        </HtmlContextProvider>
      </UserContextProvider>
      <div className={`pane top-pane ${!iframeOpen ? 'expanded' : ''}`}>
        <Editor
          language={'xml'}
          title={'HTML'}
          value={html}
          onChange={(value) => {
            saveToFireBase('html', value);
            setHtml(value);
          }}
        />
        <Editor
          language={'css'}
          title={'CSS'}
          value={css}
          onChange={(value) => {
            saveToFireBase('css', value);
            setCss(value);
          }}
        />
        <Editor
          language={'javascript'}
          title={'JS'}
          value={js}
          onChange={(value) => {
            saveToFireBase('js', value);
            setJs(value);
          }}
        />
      </div>
      <div className={`pane ${!iframeOpen ? 'collapased' : ''}`}>
        <div className={'iframe-container'}>
          <header className={'iframe-header'}>
            <div>Output:-</div>
            <div
              className={'iframe-action'}
              onClick={() => setIframeOpen((prev) => !prev)}
            >
              {iframeOpen ? <ShrinkOutlined /> : <ArrowsAltOutlined />}
            </div>
          </header>
          <div>
            <iframe
              srcDoc={iframeSrc}
              title={'output'}
              sandbox={'allow-scripts'}
              frameBorder={0}
              width={'100%'}
              height={'100%'}
            ></iframe>
          </div>
        </div>
      </div>
    </>
  );
};
App.propTypes = {
  sessionId: PropTypes.string,
  isNewSession: PropTypes.bool,
};
export default React.memo(App);
