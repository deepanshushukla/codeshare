import React, { useState } from 'react';
import PropTypes from 'prop-types';
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css';
import 'codemirror/theme/material.css';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/css/css';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/xml-fold';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/javascript-hint';
import 'codemirror/addon/hint/xml-hint';
import 'codemirror/addon/hint/html-hint';
import 'codemirror/addon/hint/css-hint';

import { Controlled as ControlledEditor } from 'react-codemirror2';
import debounced from '../../utils/debounce'
import './Editor.scss';
const autoComplete = (cm, event) => {
    if (
        !(event.ctrlKey) &&
        (event.keyCode >= 65 && event.keyCode <= 90) ||
        (event.keyCode >= 97 && event.keyCode <= 122) ||
        (event.keyCode >= 46 && event.keyCode <= 57)
    ) {
        CodeMirror.commands.autocomplete(cm, null, {completeSingle: false});
    }
}
const debouncedAutoCpomplete = debounced(autoComplete,500);
CodeMirror.commands.autocomplete = function(cm) {
    var doc = cm.getDoc();
    var POS = doc.getCursor();
    var mode = CodeMirror.innerMode(cm.getMode(), cm.getTokenAt(POS).state).mode.name;

    if (mode == 'xml') { //html depends on xml
        CodeMirror.showHint(cm, CodeMirror.hint.html,{completeSingle: false});
    } else if (mode == 'javascript') {
        CodeMirror.showHint(cm, CodeMirror.hint.javascript,{completeSingle: false});
    } else if (mode == 'css') {
        CodeMirror.showHint(cm, CodeMirror.hint.css,{completeSingle: false});
    }
};
const toggleComment = (cm) =>  cm.toggleComment();
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
              "Ctrl-/": toggleComment,
          },
          foldGutter: true,
          gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]
        }}
        onKeyUp = {debouncedAutoCpomplete}
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
