import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';

import { Console, Hook, Unhook } from 'console-feed';
import { Input } from 'antd';
import './logs.scss';

const LogsContainer = ({ runClick }) => {
  const [logs, setLogs] = useState([]);
  const [textAreaInput, setTextAreaInput] = useState('');
  const consoleDivRef = useRef(null);
  const inputRef = useRef(null);
  const focusOnInput = () => {
    inputRef.current.focus({
      cursor: 'end',
    });
  };
  useEffect(() => {
    Hook(
      window.console,
      (log) =>
        setLogs((currLogs) => {
          return [...currLogs, log];
        }),
      false
    );
    focusOnInput();
    return () => Unhook(window.console);
  }, []);

  const scrollToBottom = () => {
    let currentDiv = consoleDivRef.current;
    setTimeout(() => {
      currentDiv?.scroll({
        top: currentDiv.scrollHeight,
        behavior: 'smooth',
      });
    }, 100);
  };
  scrollToBottom();
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      try {
        console.log(eval(e.target.value.toString()));
        scrollToBottom();
      } catch (e) {
        console.error(e);
        scrollToBottom();
      }
      setTextAreaInput('');
    }
  };
  const clearConsole = () => {
    setLogs([]);
    focusOnInput();
  };

  return (
    <div className={'console'}>
      <div className="console-header">
        <div className="left">
          <span className={'title'}>Console</span>
        </div>
        <div className="right">
          <a onClick={runClick}>
            <PlayCircleOutlined />
          </a>
          <a onClick={clearConsole}>
            <DeleteOutlined />
          </a>
        </div>
      </div>
      <div className={'console-list'} ref={consoleDivRef}>
        <Console className={'console-list'} logs={logs} variant="dark" />
      </div>
      <Input
        className={'console-input'}
        size="small"
        prefix=">"
        ref={inputRef}
        bordered={false}
        value={textAreaInput}
        style={{ color: 'white' }}
        onChange={(e) => setTextAreaInput(e.target.value)}
        onKeyUp={handleKeyPress}
      ></Input>
    </div>
  );
};
LogsContainer.propTypes = {
  runClick: PropTypes.func,
};
export default LogsContainer;
