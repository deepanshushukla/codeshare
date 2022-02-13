import React , { useState } from 'react';
import ReactDOM from 'react-dom';
import "./App.scss";
import EditorPic from '../../images/code-share.png' 
import { BrowserRouter as Router, Route,Link } from 'react-router-dom';
// components
import Logo from "../../images/share.svg";
import App from './App';
import AppContainer from "./Appcontainer"
import Footer2 from '../Footer';
import { Footer } from 'antd/lib/layout/layout';

const AppMainPage=()=>{
    const  helpfulPointsListItems = [
        'Remote pair programming, mob programming',
        'Teaching programming, class in school',
        'Online study group, seminar, workshop, tech meet up',
        'Programming live stream, broadcast',
        'Troubleshooting, support',
        'Interviews, programming test',
        'And more...'
    ];
    const appName = 'JSCodeShare';
    const gifCss = {
        width:'100%',
        height:'400px',
        position: 'relative',
        display: 'block',
        width: '56%',
        margin: '0 auto'
      };
    return(
        <div className='main-page-wrapper'>
            <div className='container-common'>
                <header className='header-wrapper'>
                <Link to="/"><img src={Logo}/><span className='title'>{appName}</span></Link>
                <span><Link to="/code">+ Create New Room</Link></span>
                </header>
                <div className="get-wrapper">
                <section className="login">
                    <h1>Share code in real-time in {appName} </h1>
                    <p>{appName}  lets share their workspace with online developers and collaborate on code in real-time.</p>
                    <button className="started-button"><Link to="/code">Create New Room</Link></button>
                </section>
            </div>
            <div>
              <img width="100%" src={EditorPic} alt="editor-picture"/>
            </div>
             <div class="container-fluid main-container page-terms-container">
                <h1>
                Let's code together
                </h1>
                <ul className='helpful-points'> {helpfulPointsListItems.map((user) => (
                    <li >{user}</li>
                ))}
            </ul>
    <h1>Feedback</h1>
<p>
<strong className='hightlighted-text'>{appName}</strong> is now in beta release and available for you to try for free.
We welcome your feedback and comments. If you have any problems, bug reports or enhancement requests, please open and submit the {appName} Issues.
</p>
<p>
  By accessing or using the Service you agree to be bound by these Terms.
  If you disagree with any part of the terms then you may not access the Service.
  </p>

<h2>Links To Other Web Sites</h2>
<p>
  Our Service may contain links to third-party web sites or services that are not owned or controlled by {appName}.
</p>
<p>
  {appName} has no control over, and assumes no responsibility for, the content, privacy policies, or practices of any third party web sites or services.
  You further acknowledge and agree that {appName}  shall not be responsible or liable, directly or indirectly, for any damage or loss caused or alleged to be caused by or in connection with use of or reliance on any such content, goods or services available on or through any such web sites or services.
</p>
<p>
  We strongly advise you to read the terms and conditions and privacy policies of any third-party web sites or services that you visit.
</p>
<h2>Termination</h2>
<p>
  We may terminate or suspend access to our Service immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
</p>
<p>
  All provisions of the Terms which by their nature should survive termination shall survive termination, including, without limitation, ownership provisions, warranty disclaimers, indemnity and limitations of liability.
</p>
<h2>Governing Law</h2>
<p>
  These Terms shall be governed and construed in accordance with the laws of Japan, without regard to its conflict of law provisions.
</p>
<p>
  Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights. If any provision of these Terms is held to be invalid or unenforceable by a court, the remaining provisions of these Terms will remain in effect. These Terms constitute the entire agreement between us regarding our Service, and supersede and replace any prior agreements we might have between us regarding the Service.
</p>
<h2>Changes</h2>
<p>
  We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material we will try to provide at least 30 days notice prior to any new terms taking effect. What constitutes a material change will be determined at our sole discretion.
</p>
<p>
  By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms. If you do not agree to the new terms, please stop using the Service.
</p>
  </div>
        <Footer2/>
        </div>
        </div>
       )
}

export default AppMainPage