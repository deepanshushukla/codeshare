import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { Input, Menu } from 'antd';
import UserContext from '../../../context/userContext';
import './UserList.scss';
const UsersList = ({ users, onNameChange }) => {
  const currentUserId = useContext(UserContext);

  return (
    <Menu>
      {users.map((user) => (
        <Menu.Item key={user.userId} className={'users__menu'}>
          <div>
            <Input
              value={user.name}
              onChange={(e) => onNameChange(user.userId, e)}
              disabled={currentUserId !== user.userId}
            />
          </div>
        </Menu.Item>
      ))}
    </Menu>
  );
};
UsersList.propTypes = {
  users: PropTypes.array,
  onNameChange: PropTypes.func,
};

export default UsersList;
