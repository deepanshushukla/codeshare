import React, { useContext } from 'react';

import { Button, Dropdown, Menu } from 'antd';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';

import { DownloadOutlined } from '@ant-design/icons';
import HtmlContext from '../../context/htmlContext';

const TXT = 'txt';
const PDF = 'pdf';
const FILE_TYPE = {
  [TXT]: 'text/plain;charset=utf-8',
  [PDF]: 'application/pdf',
};
const MENU_OPTIONS = [
  {
    title: 'Txt File',
    key: TXT,
  },
  {
    title: 'Pdf File',
    key: PDF,
  },
];
const MenuItems = ({ handleClick }) => (
  <Menu onClick={handleClick}>
    {MENU_OPTIONS.map(({ key, title }) => (
      <Menu.Item key={key}>{title}</Menu.Item>
    ))}
  </Menu>
);
const FileSaver = () => {
  const html = useContext(HtmlContext);

  const handleClick = (e) => {
    let fileName = 'sharedcode.txt';
    let doc;
    switch (e.key) {
      case TXT:
        saveAs(new Blob([html], { type: FILE_TYPE[e.key] }), fileName);
        break;
      case PDF:
        fileName = 'sharedCode.pdf';
        doc = new jsPDF();
        doc.text(html, 10, 10);
        doc.save(fileName);
    }
  };
  return (
    <Dropdown
      key={'1'}
      overlay={<MenuItems handleClick={handleClick} />}
      placement="bottomLeft"
      arrow
    >
      <Button shape="circle" icon={<DownloadOutlined />} size={'small'} />
    </Dropdown>
  );
};

export default FileSaver;
