import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

import firebase from 'firebase';
import rand from 'random-key';
import {
  ShrinkOutlined,
  ArrowsAltOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
} from '@ant-design/icons';

//component
import Editor from '../Editor/Editor';
import Header from '../Header';
import LogsContainer from '../Logs';
//utils
import firebaseRealTime from '../../utils/firebaseRealtime';
//context
import { UserContextProvider } from '../../context/userContext';
import { HtmlContextProvider } from '../../context/htmlContext';

//css
import './App.scss';

const App = ({ sessionId, isNewSession }) => {
  const [html, setHtml] = useState(
    '<div class="text">Welcome to JS code share</div>'
  );
  const [autoRun, setAutoRun] = useState(true);
  const [css, setCss] = useState('.text{\n' + '  color: blue\n' + '}');
  const [js, setJs] = useState('console.log("Welcome to JSCodeShare")');
  const [userId, setUserId] = useState(() => {
    if (sessionStorage.getItem('user')) {
      return JSON.parse(sessionStorage.getItem('user')).userId;
    }
    return;
  });
  const [users, setUsers] = useState([]);
  const [iframeSrc, setIframeSrc] = useState('');
  const [bottomPaneOpen, setBottomPaneOpen] = useState(true);
  const [iframePaneOpen, setIframePaneOpen] = useState(true);
  const [iframePaneClose, setIframePaneClose] = useState(false);
  let fireBaseRef = `live-sessions/${sessionId}`;
  const fireBaseDatabaseRef = firebase.database().ref(fireBaseRef);
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
      .catch(() => {});
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
  const runClick = () => {
    try {
      refreshIframe();
      eval(js);
    } catch (e) {
      console.error(e);
    }
  };
  const saveToFireBase = (key, value) => {
    firebaseRealTime(firebase.database().ref(fireBaseRef)).update({
      [key]: value,
    });
  };
  const onNameChange = (id, e) => {
    firebaseRealTime(firebase.database().ref(fireBaseRef)).update({
      [`users/${id}/name`]: e.target.value,
    });
  };
  return (
    <>
      <UserContextProvider value={userId}>
        <HtmlContextProvider value={{ iframeSrc, html, css, js }}>
          <Header
            users={users}
            onNameChange={onNameChange}
            autoRun={autoRun}
            refreshIframe={runClick}
            setAutoRun={setAutoRun}
          />
        </HtmlContextProvider>
      </UserContextProvider>
      <div className={`top-pane ${!bottomPaneOpen ? 'expanded' : ''}`}>
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
      <div className={`bottom-pane ${!bottomPaneOpen ? 'collapased' : ''}`}>
        <div
          className={'bottom-pane-action'}
          onClick={() => setBottomPaneOpen((prev) => !prev)}
        >
          <div>Output & Console</div>
          <div>
            {bottomPaneOpen ? (
              <span>
                Hide <ArrowDownOutlined />
              </span>
            ) : (
              <span>
                Show <ArrowUpOutlined />
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {!iframePaneClose && (
            <div
              className={`editor-container bottom iframe-pane ${
                !iframePaneOpen ? 'collapased' : ''
              }`}
            >
              <header className={'iframe-pane-header'}>
                <div>Output:-</div>
                <div className={'iframe-pane-action'}>
                  <div
                    style={{ color: 'black' }}
                    onClick={() => setIframePaneOpen((prev) => !prev)}
                  >
                    {iframePaneOpen ? (
                      <ShrinkOutlined />
                    ) : (
                      <ArrowsAltOutlined />
                    )}
                  </div>
                  {!iframePaneClose && (
                    <div
                      style={{ color: 'black' }}
                      onClick={() => setIframePaneClose((prev) => !prev)}
                    >
                      <CloseOutlined />
                    </div>
                  )}
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
          )}
          <div className={'editor-container bottom'}>
            <LogsContainer runClick={runClick} />
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
