import React, { useState, useEffect } from 'react';
import { useParams, useHistory } from 'react-router-dom';
import Firebase from 'firebase';
import rand from 'random-key';
//component
import Editor from '../Editor/Editor';
//css
import './App.scss';

const App = () => {
  const [html, setHtml] = useState('');
  const [css, setCss] = useState('');
  const [js, setJs] = useState('');
  const [iframeSrc, setIframeSrc] = useState('');
  let { sessionId } = useParams();
  const history = useHistory();
  let fireBaseDatabaseRef;
  const setValueFromSnapshot = (
    snapshot = { val: () => ({ html: '', css: '', js: '' }) }
  ) => {
    const { html = '', css = '', js = '' } = snapshot.val();
    setHtml(html);
    setCss(css);
    setJs(js);
  };
  useEffect(() => {
    if (!sessionId) {
      sessionId = rand.generate(10);
      history.push({ pathname: `/${sessionId}` });
      Firebase.database()
        .ref('live-sessions/' + sessionId)
        .set({
          html,
          css,
          js,
        });
    }
    fireBaseDatabaseRef = Firebase.database().ref('live-sessions/' + sessionId);
  }, []);
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
      setIframeSrc(`<html>
                        <body>${html}</body>
                         <style>${css}</style>
                         <script>${js}</script>
                     </html>`);
    }, 300);
    return () => clearTimeout(timeout);
  }, [html, css, js]);

  const saveToFireBase = (key, value) => {
    Firebase.database()
      .ref('live-sessions/' + sessionId)
      .update({
        [key]: value,
      });
  };
  return (
    <>
      <div className="pane top-pane">
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
      <div className="pane">
        <div>
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

export default App;
