import React, { useState } from 'react';
import PropTypes from 'prop-types';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/css/css';
import 'codemirror/mode/javascript/javascript';
import { Controlled as ControlledEditor } from 'react-codemirror2';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCompressAlt, faExpandAlt } from '@fortawesome/free-solid-svg-icons';
import './Editor.scss';
const Editor = ({ title, language, value, onChange }) => {
  const [editorOpen, setEditorOpen] = useState(true);

  const handleChange = (editor, data, value) => {
    onChange(value);
  };
  return (
    <div className={`editor-container ${editorOpen ? '' : 'collapsed'}`}>
      <div className="editor-title">
        {title}
        <div
          className={'expand-compress-icon'}
          onClick={() => setEditorOpen((prev) => !prev)}
        >
          <FontAwesomeIcon icon={editorOpen ? faCompressAlt : faExpandAlt} />
        </div>
      </div>
      <ControlledEditor
        value={value}
        onBeforeChange={handleChange}
        options={{
          lint: true,
          lineWrapping: true,
          mode: language,
          lineNumbers: true,
          theme: 'material',
        }}
        className={'code-mirror-container'}
      />
    </div>
  );
};
Editor.propTypes = {
  title: PropTypes.string,
  language: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
};
export default Editor;
