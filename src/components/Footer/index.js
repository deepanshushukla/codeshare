import React from "react";
import "./Footer.scss";
import {
  FacebookFilled,
  PhoneFilled,
  TwitterSquareFilled,
  MailFilled,
  LinkedinFilled,
} from "@ant-design/icons";

const SocialAppFooter = ({}) => {
  return (
    <div className="footer-wrapper">
      <div>
        <a
          target="_blank"
          href="https://www.facebook.com/profile.php?id=100007840425885"
        >
          <FacebookFilled />
        </a>
        <a target="_blank" href="https://twitter.com/deeps1790">
          <TwitterSquareFilled />
        </a>
        <a
          target="_blank"
          href="https://www.linkedin.com/in/deepanshu-shukla-48227062/"
        >
          <LinkedinFilled />
        </a>
      </div>
      <div className="">
        <a target="_blank" href="mailto:deeps1790@gmail.com">
          <MailFilled />
        </a>
        <a target="_blank" href="tel:+91-7838116024">
          <PhoneFilled />
        </a>
      </div>
    </div>
  );
};
export default SocialAppFooter;
