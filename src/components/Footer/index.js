import React from "react";
import "./Footer.scss";
import { FacebookFilled ,PhoneFilled , TwitterSquareFilled , MailFilled ,LinkedinFilled} from '@ant-design/icons';
const Footer2 = ({

}) => {
  return (
<div className="footer-wrapper">
  <div>
<a  href="www.facebook.com"><FacebookFilled /></a>
<a  href="www.twitter.com"><TwitterSquareFilled /></a>
<a href="www.linekdin.com"><LinkedinFilled /></a>
</div>
<div className="">  
<a  href="www.gmail.com"><MailFilled /></a>
<a href="tel:+91-7838116024"><PhoneFilled /></a>
</div>
</div>
  )
};
export default Footer2;
