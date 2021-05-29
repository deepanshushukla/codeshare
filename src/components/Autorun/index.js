import React from 'react';
import PropTypes from 'prop-types';
import { PlayCircleFilled } from '@ant-design/icons';

import { Button, Checkbox, Tooltip } from 'antd';
import './Autorun.scss';
const Autorun = ({ autoRun, setAutoRun, refreshIframe }) => {
  return (
    <div className={'autorun'}>
      {!autoRun && (
        <Tooltip placement="bottom" title={'Run'} color={'grey'}>
          <Button
            shape="circle"
            icon={<PlayCircleFilled />}
            onClick={refreshIframe}
            type={'primary'}
            size={'small'}
            className={'autorun__btn'}
          ></Button>
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
