import React from 'react';
import PropTypes from 'prop-types';

import { PageHeader } from 'antd';
import Users from '../Users';
import FileSaver from '../FileSaver';
import Autorun from '../Autorun';
import './Header.scss';

const Header = ({
  users,
  onNameChange,
  autoRun,
  refreshIframe,
  setAutoRun,
}) => {
  return (
    <PageHeader
      className="header"
      title=""
      extra={[
        <Autorun
          key={1}
          autoRun={autoRun}
          refreshIframe={refreshIframe}
          setAutoRun={setAutoRun}
        />,
        <FileSaver key={2} />,
        <Users key={3} users={users} onNameChange={onNameChange} />,
      ]}
      avatar={{
        src: 'https://avatars1.githubusercontent.com/u/8186664?s=460&v=4',
      }}
    />
  );
};
Header.propTypes = {
  users: PropTypes.array,
  onNameChange: PropTypes.func,
  autoRun: false,
  refreshIframe: PropTypes.func,
  setAutoRun: PropTypes.func,
};
export default Header;
