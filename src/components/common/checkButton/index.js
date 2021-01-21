import React from 'react';
import PropTypes from 'prop-types';
import './index.scss';
const CheckboxInput = ({ checked, onChange, label = 'Auto Run' }) => (
  <div className={'checkboxContainer'}>
    <input
      type="checkbox"
      className={'checkboxContainer-input'}
      id="autorun_box"
      checked={checked}
      onChange={onChange}
    />
    {label && (
      <label htmlFor="autorun_box" className={'checkboxContainer-label'}>
        {label}
      </label>
    )}
  </div>
);
CheckboxInput.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  label: PropTypes.string,
};

export default CheckboxInput;
