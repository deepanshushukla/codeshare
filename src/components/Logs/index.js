import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import { DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';

import { Console, Hook, Unhook } from 'console-feed';
import { Input } from 'antd';
import './logs.scss';
const styles = {
  BASE_FONT_SIZE: 14,
  OBJECT_VALUE_UNDEFINED_COLOR: '#ffffff',
  OBJECT_NAME_COLOR: '#ffffff',
  OBJECT_VALUE_NULL_COLOR: '#ffffff',
  OBJECT_VALUE_REGEXP_COLOR: '#ffffff',
  OBJECT_VALUE_STRING_COLOR: '#ffffff',
  OBJECT_VALUE_SYMBOL_COLOR: '#ffffff',
  OBJECT_VALUE_NUMBER_COLOR: '#ffffff',
  OBJECT_VALUE_BOOLEAN_COLOR: '#ffffff',
  OBJECT_VALUE_FUNCTION_KEYWORD_COLOR: '#ffffff',
  LOG_ERROR_ICON: null,
  BASE_BACKGROUND_COLOR : 'transparent',
};
const LogsContainer = ({ runClick }) => {
  const [logs, setLogs] = useState([]);
  const [textAreaInput, setTextAreaInput] = useState('');
  const consoleDivRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const scrollToBottom = () => {
    messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  };
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

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      try {
        console.log(eval(e.target.value.toString()));
        setTimeout(scrollToBottom,300)
      } catch (e) {
        console.error(e);
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
      <div className={'console-list'} ref={consoleDivRef}>
        <Console
          className={'console-list'}
          styles={styles}
          logs={logs}
          variant="dark"
        />
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
LogsContainer.propTypes = {
  runClick: PropTypes.func,
};
export default LogsContainer;
