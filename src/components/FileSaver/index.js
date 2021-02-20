import React, { useContext } from 'react';

import { Button, Dropdown, Menu } from 'antd';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

import { DownloadOutlined } from '@ant-design/icons';
import HtmlContext from '../../context/htmlContext';

const HTML = 'html';
const ZIP = 'zip';
const FILE_TYPE = {
  [HTML]: 'text/html;charset=utf-8',
  [ZIP]: 'application/pdf',
};
const MENU_OPTIONS = [
  {
    title: 'Html File',
    key: HTML,
  },
  {
    title: 'Zip File',
    key: ZIP,
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
  const { iframeSrc, css, js, html } = useContext(HtmlContext);
  console.log(iframeSrc);
  const htmlFile = `<!DOCTYPE html><html>
    <head><link href="./css/index.css" rel="stylesheet"></head>
    <body>
        ${html}
      <script src="./js/index.js"></script>
     </body>
</html>`;
  const handleClick = (e) => {
    let currentdate = new Date();
    let datetime = `${currentdate.getDate()}/${
      currentdate.getMonth() + 1
    }/${currentdate.getFullYear()}@${currentdate.getHours()}:${currentdate.getMinutes()}:${currentdate.getSeconds()}`;
    let fileName = `CodeShare_${datetime}.html`;
    let zip;
    switch (e.key) {
      case HTML:
        saveAs(new Blob([iframeSrc], { type: FILE_TYPE[e.key] }), fileName);
        break;
      case ZIP:
        zip = new JSZip();
        zip.file('index.html', htmlFile);
        zip.file('css/index.css', css);
        zip.file('js/index.js', js);
        zip.generateAsync({ type: 'blob' }).then(function (content) {
          saveAs(content, `CodeShare_${datetime}.zip`);
        });
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
