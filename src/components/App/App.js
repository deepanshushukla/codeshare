import React, { useState, useEffect } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import Firebase from 'firebase';
import rand from 'random-key';
//component
import Editor from '../Editor/Editor';
import Button from '../common/button';
import CheckButton from '../common/checkButton';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompressAlt, faExpandAlt } from '@fortawesome/free-solid-svg-icons';
//utils
import firebaseRealTime from '../../utils/firebaseRealtime';

//css
import './App.scss';

const App = () => {
  const [html, setHtml] = useState('');
  const [autoRun, setAutoRun] = useState(true);
  const [css, setCss] = useState('');
  const [js, setJs] = useState('');
  const [iframeSrc, setIframeSrc] = useState('');
  const [iframeOpen, setIframeOpen] = useState(true);
  let { sessionId } = useParams();
  let fireBaseRef = `live-sessions/${sessionId}`;
  const history = useHistory();
  let fireBaseDatabaseRef;
  if (!sessionId) {
    sessionId = rand.generate(10);
    fireBaseRef = `live-sessions/${sessionId}`;
    history.push({ pathname: `/${sessionId}` });
    firebaseRealTime(Firebase.database().ref(fireBaseRef)).set({
      html,
      css,
      js,
    });
  }
  const setValueFromSnapshot = (
    snapshot = { val: () => ({ html: '', css: '', js: '' }) }
  ) => {
    const { html = '', css = '', js = '' } = snapshot.val() || {};
    setHtml(html);
    setCss(css);
    setJs(js);
  };
  fireBaseDatabaseRef = Firebase.database().ref(fireBaseRef);

  useEffect(() => {
    fireBaseDatabaseRef
      .once('value')
      .then((snapshot) => {
        setValueFromSnapshot(snapshot);
      })
      .catch((e) => {
        console.log(e);
      });
    fireBaseDatabaseRef.on('value', (snapshot) => {
      setValueFromSnapshot(snapshot);
    });
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (autoRun) {
        refreshIframe();
      } else {
        timeout && clearTimeout(timeout);
      }
    }, 300);
    return () => timeout && clearTimeout(timeout);
  }, [html, css, js, autoRun]);
  const refreshIframe = () => {
    setIframeSrc(`<html>
                        <body>${html}</body>
                         <style>${css}</style>
                         <script>${js}</script>
                     </html>`);
  };
  const saveToFireBase = (key, value) => {
    firebaseRealTime(fireBaseDatabaseRef).update({
      [key]: value,
    });
  };
  return (
    <>
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
              <FontAwesomeIcon
                icon={iframeOpen ? faCompressAlt : faExpandAlt}
              />
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
      <div className={`actionBar ${!iframeOpen ? 'collapased' : ''}`}>
        {!autoRun && <Button title={'Run'} onClick={refreshIframe} />}
        <CheckButton
          checked={autoRun}
          onChange={() => setAutoRun((prev) => !prev)}
        />
      </div>
    </>
  );
};

export default App;
