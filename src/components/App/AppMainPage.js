import AppContainer from "./Appcontainer"
import React from 'react';
import ReactDOM from 'react-dom';
import "./App.scss";
import { BrowserRouter as Router, Route,Link } from 'react-router-dom';
const AppMainPage=()=>{
    return(
        <>
            <div className="get-wrapper">
                <section className="login">
                    <h1>Click button to start '<span className="app-name">JS CODE SHARE</span>'</h1>
                    <button className="started-button"><Link to="/code">Get Started</Link></button>
                </section>
            </div>
        </>
       )
}

export default AppMainPage