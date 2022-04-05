import React, { useState, useEffect } from "react";
import { useHistory, useParams, useLocation } from "react-router-dom";

import PropTypes from "prop-types";
import { ReflexContainer, ReflexElement, ReflexSplitter } from "react-reflex";
import firebase from "firebase";
import rand from "random-key";
import {Empty} from 'antd'

//component
import Editor from "../Editor/Editor";
import Header from "../Header";
import LogsContainer from "../Logs";
//utils
import firebaseRealTime from "../../utils/firebaseRealtime";
//context
import { UserContextProvider } from "../../context/userContext";
import { HtmlContextProvider } from "../../context/htmlContext";

//css
import "react-reflex/styles.css";

import "./App.scss";

const Initial_Tabs = {
  html: false,
  css: false,
  js: true,
  console: true,
  output: false,
};
const App = ({ sessionId, isNewSession }) => {
  const {search} = useLocation();
  const history = useHistory();

  const [html, setHtml] = useState(
    '<div class="text">Welcome to JS code share</div>'
  );
  const [autoRun, setAutoRun] = useState(false);
  const [tabs, setTabs] = useState({ ...Initial_Tabs });
  const [css, setCss] = useState(".text{\n" + "  color: blue\n" + "}");
  const [js, setJs] = useState('console.log("Welcome to JSCodeShare")');
  const [userId, setUserId] = useState(() => {
    if (sessionStorage.getItem("user")) {
      return JSON.parse(sessionStorage.getItem("user")).userId;
    }
  });
  const [users, setUsers] = useState([]);
  const [iframeSrc, setIframeSrc] = useState("");
  let fireBaseRef = `live-sessions/${sessionId}`;
  const fireBaseDatabaseRef = firebase.database().ref(fireBaseRef);
  const setValueFromSnapshot = (
    snapshot = { val: () => ({ html: "", css: "", js: "" }) }
  ) => {
    const { html = "", css = "", js = "", users = {} } = snapshot.val() || {};
    setHtml(html);
    setCss(css);
    setJs(js);
    setUsers(Object.values(users).filter((item) => item.status === "online"));
  };
  const tabsChange = (tabs) =>{
    let str = '';
    for (let key in tabs){
      if(tabs[key]){
        str = str + key +','
      }
    }
    let urlParams = {pathname: `/code/${sessionId}`};
    if(str) {
      urlParams.search = `?selectedTabs=${str.substring(0,str.length-1)}`
    }
    history.push(urlParams);
    setTabs(tabs);
  };
  useEffect(()=>{
    if(search){
      const selectedTabs = new URLSearchParams(search).get('selectedTabs');
      if(selectedTabs){
        let inpArr = selectedTabs.split(',');
        for (let key in Initial_Tabs){
          Initial_Tabs[key] = false
        }
        inpArr.forEach((item)=>{
          Initial_Tabs[item] = true
        });
        setTabs({ ...Initial_Tabs})
      }
    }else{
      tabsChange(tabs)
    }

  },[]);

  useEffect(() => {
    fireBaseDatabaseRef
      .once("value")
      .then((snapshot) => {
        if (snapshot.exists()) {
          setValueFromSnapshot(snapshot);
        }
      })
      .catch(() => {});
    fireBaseDatabaseRef.on("value", (snapshot) => {
      if (snapshot.exists()) {
        setValueFromSnapshot(snapshot);
      }
    });
  }, []);
  const getNewUserInSession = () => {
    const userId = rand.generate(3);
    setUserId(userId);
    let newUser = { name: `User_${userId}`, status: "online", userId };
    sessionStorage.setItem("user", JSON.stringify(newUser));
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
        [`users/${userId}/status`]: "online",
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
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        if (userId) {
          firebaseRealTime(fireBaseDatabaseRef).update({
            [`users/${userId}/status`]: "online",
          });
        }
      } else {
        if (document.visibilityState === "hidden" && userId) {
          firebaseRealTime(fireBaseDatabaseRef).update({
            [`users/${userId}/status`]: "away",
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
  const showEmpty = () =>{
    return  !tabs.console && !tabs.output && !tabs.html && !tabs.js && !tabs.css
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
            setTabs={tabsChange}
            tabs={tabs}
          />
        </HtmlContextProvider>
      </UserContextProvider>
      {showEmpty() && <div className='emptyContainer'><Empty description={'No Tab is selected'}/></div>}
      <ReflexContainer orientation="vertical" className="tabsConatiner">
        {tabs.html && (
          <ReflexElement>
            <Editor
              language={"xml"}
              title={"HTML"}
              value={html}
              onChange={(value) => {
                saveToFireBase("html", value);
                setHtml(value);
              }}
            />
          </ReflexElement>
        )}
        {tabs.html && <ReflexSplitter />}
        {tabs.css && (
          <ReflexElement className="tab">
            <Editor
              language={"css"}
              title={"CSS"}
              value={css}
              onChange={(value) => {
                saveToFireBase("css", value);
                setCss(value);
              }}
            />
          </ReflexElement>
        )}
        {tabs.css && <ReflexSplitter />}

        {tabs.js && (
          <ReflexElement className="tab">
            <Editor
              language={"javascript"}
              title={"JS"}
              value={js}
              onChange={(value) => {
                saveToFireBase("js", value);
                setJs(value);
              }}
            />
          </ReflexElement>
        )}
        {tabs.js && <ReflexSplitter />}

        {tabs.console && (
          <ReflexElement className="tab">
            <LogsContainer runClick={runClick} />
          </ReflexElement>
        )}
        {tabs.console && <ReflexSplitter />}
        {tabs.output && (
          <ReflexElement className="tab">
            <div className={'iframeContainer'}>
              <div className="iframetitle">Output</div>
              <iframe
                srcDoc={iframeSrc}
                title={"output"}
                sandbox={"allow-scripts"}
                frameBorder={0}
                width={"100%"}
                height={"100%"}
              ></iframe>
            </div>
          </ReflexElement>
        )}
      </ReflexContainer>
    </>
  );
};
App.propTypes = {
  sessionId: PropTypes.string,
  isNewSession: PropTypes.bool,
};
export default React.memo(App);

