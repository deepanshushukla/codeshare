import React from 'react';
import { Link } from 'react-router-dom';

import { Result, Button } from 'antd';

const Error = () => {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Sorry, the page you visited does not exist."
      extra={
        <Link to="/">
          <Button type={'primary'}>Create New Session</Button>
        </Link>
      }
    />
  );
};

export default Error;
