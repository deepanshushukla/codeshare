import React from "react";
import "./App.scss";
import EditorPic from "../../images/codeShare.png";
import { Link } from "react-router-dom";
// components
import Logo from "../../images/share.svg";
import SocialAppFooter from "../Footer";

const helpfulPointsListItems = [
  "Remote pair programming",
  "Interviews, programming test",
  "Share your code in real time",
  "Download all your code in zip and html format",
  "Online study group, seminar, workshop, tech meet up",
  "Troubleshooting, support",
  "And more...",
];
const appName = "JSCodeShare";
const gifCss = {
  height: "400px",
  position: "relative",
  display: "block",
  width: "56%",
  margin: "0 auto",
};
const AppMainPage = () => {
  return (
    <div className="main-page-wrapper">
      <div className="container-common">
        <header className="header-wrapper">
          <Link to="/">
            <img src={Logo} />
            <span className="title">{appName}</span>
          </Link>
          <span>
            <Link to="/code">+ Create New Room</Link>
          </span>
        </header>
        <div className="get-wrapper">
          <section className="login">
            <h1>Share code in real-time with {appName} </h1>
            <p>
              {appName} lets share the workspace with online developers and
              collaborate on code in real-time.
            </p>
            <button className="started-button">
              <Link to="/code">Create New Room</Link>
            </button>
          </section>
        </div>
        <div>
          <img width="100%" src={EditorPic} alt="editor-picture" />
        </div>
        <div class="container-fluid main-container page-terms-container">
          <h1>Let's code together</h1>
          <ul className="helpful-points">
            {" "}
            {helpfulPointsListItems.map((user) => (
              <li>{user}</li>
            ))}
          </ul>
          <h1>Feedback</h1>
          <p>
            <strong className="hightlighted-text">{appName}</strong> is now in
            beta release and available for you to try for free. We welcome your
            feedback and comments. If you have any problems, bug reports or
            enhancement requests, please provide feedback.
          </p>

        </div>
        <SocialAppFooter />
      </div>
    </div>
  );
};

export default AppMainPage;
