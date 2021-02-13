import React from 'react';
import PropTypes from 'prop-types';

import { Badge, Button, Dropdown } from 'antd';
import { UsergroupAddOutlined } from '@ant-design/icons';
import UsersList from './UserList';
const Users = ({ users, onNameChange }) => {
  return (
    <Dropdown overlay={<UsersList users={users} onNameChange={onNameChange} />}>
      <Badge count={users.length} size="small">
        <Button
          shape={'circle'}
          icon={<UsergroupAddOutlined />}
          size={'small'}
        ></Button>
      </Badge>
    </Dropdown>
  );
};
Users.propTypes = {
  users: PropTypes.array,
  onNameChange: PropTypes.func,
};
export default Users;
