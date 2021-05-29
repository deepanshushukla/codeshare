import React from 'react';
import PropTypes from 'prop-types';

import { PageHeader } from 'antd';
import Users from '../Users';
import FileSaver from '../FileSaver';
import Autorun from '../Autorun';
import './Header.scss';
import Logo from '../../images/share.svg';

const Header = ({ users, onNameChange, refreshIframe, setAutoRun }) => {
  return (
    <PageHeader
      className="header"
      title="JSCodeShare"
      extra={[
        <Autorun
          key={1}
          autoRun={false}
          refreshIframe={refreshIframe}
          setAutoRun={setAutoRun}
        />,
        <FileSaver key={2} />,
        <Users key={3} users={users} onNameChange={onNameChange} />,
      ]}
      avatar={{
        src: Logo,
      }}
    />
  );
};
Header.propTypes = {
  users: PropTypes.array,
  onNameChange: PropTypes.func,
  autoRun: PropTypes.bool,
  refreshIframe: PropTypes.func,
  setAutoRun: PropTypes.func,
};
export default Header;
