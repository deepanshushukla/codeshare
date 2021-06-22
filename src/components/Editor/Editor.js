import React, { useState } from 'react';
import PropTypes from 'prop-types';
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/css/css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/comment/comment';

import { Controlled as ControlledEditor } from 'react-codemirror2';

import './Editor.scss';
const toggleComment = (cm) =>  cm.toggleComment()
const Editor = ({ title, language, value, onChange }) => {
  const [editorOpen, setEditorOpen] = useState(true);

  const handleChange = (editor, data, value) => {
    onChange(value);
  };
  return (
    <div className={`editor-container ${editorOpen ? '' : 'collapsed'}`}>
      <div className="editor-title">
        {title}
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
          autoCloseBrackets: true,
          tabSize:2,
          indentWithTabs:true,
          smartIndent:false,
          extraKeys: {
              "Cmd-/": toggleComment,
              "Ctrl-/": toggleComment
          },
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
