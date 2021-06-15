import React from "react";
import PropTypes from "prop-types";

import { PageHeader } from "antd";
import Users from "../Users";
import FileSaver from "../FileSaver";
import Autorun from "../Autorun";
import "./Header.scss";
import Logo from "../../images/share.svg";
const itemmap= {
    html:'HTML',
    css:'CSS',
    js:'JS',
    console:'Console',
    output:'Output',
}
const Tabs = ({ tabs, setTabs }) => {
    const changeTabs = (key) => {
    setTabs({ ...tabs, [key]: !tabs[key] });
  };
  return (
    <div className="tab">
      {Object.keys(tabs).map((item) => {
        return (
          <button
            className={`tablinks ${tabs[item] ? "active" : ""}`}
            onClick={() => changeTabs(item)}
          >
            {itemmap[item]}
          </button>
        );
      })}
    </div>
  );
};
const Header = ({
  users,
  onNameChange,
  refreshIframe,
  setAutoRun,
  setTabs,
  tabs,
}) => {
  return (


      <div className='header'>
          <div  className='left'>
              <div><img src={Logo}/><span className='title'>JSCodeShare</span></div>
          </div>
          <div className='center'>
              <Tabs setTabs={setTabs} tabs={tabs} />
          </div>
          <div className='right'>
              <Autorun
                  key={1}
                  autoRun={false}
                  refreshIframe={refreshIframe}
                  setAutoRun={setAutoRun}
              />
              <FileSaver key={2} />
              <Users key={3} users={users} onNameChange={onNameChange} />
          </div>
      </div>
  );
};
Header.propTypes = {
  users: PropTypes.array,
  onNameChange: PropTypes.func,
  autoRun: PropTypes.bool,
  tabs: PropTypes.object,
  refreshIframe: PropTypes.func,
  setAutoRun: PropTypes.func,
  setTabs: PropTypes.func,
};
export default Header;
