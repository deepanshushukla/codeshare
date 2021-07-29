import React , { useEffect } from 'react';
import PropTypes from 'prop-types';
import { PlayCircleFilled } from '@ant-design/icons';

import { Button, Checkbox, Tooltip } from 'antd';
import './Autorun.scss';
const Autorun = ({ autoRun, setAutoRun, refreshIframe }) => {
  useEffect(() => {
    const runEvent = (e)=>{
      e.stopPropagation();
      if(e.keyCode===13 && (e.ctrlKey || e.metaKey)){
        refreshIframe();
      }
    };
    window.addEventListener('keydown', runEvent);
    return () => {
      window.removeEventListener('keydown', runEvent);
    }
  })
  return (
    <div className={'autorun'}>
      {!autoRun && (
        <Tooltip placement="bottom" title={'Run'} color={'grey'}>

          <Button
            onClick={refreshIframe}
            icon={<PlayCircleFilled />}
            size='small'
            type={'primary'}
            className={'autorun__btn'}
          > Run (Ctrl+ ⏎)</Button>
        </Tooltip>
      )}
      {false && (
        <Checkbox
          checked={autoRun}
          onChange={() => setAutoRun((prev) => !prev)}
        >
          AutoRun
        </Checkbox>
      )}
    </div>
  );
};
Autorun.propTypes = {
  autoRun: PropTypes.bool,
  refreshIframe: PropTypes.func,
  setAutoRun: PropTypes.func,
};
Autorun.defaultProps = {
  autoRun: false,
  refreshIframe: () => {},
  setAutoRun: () => {},
};
export default Autorun;
