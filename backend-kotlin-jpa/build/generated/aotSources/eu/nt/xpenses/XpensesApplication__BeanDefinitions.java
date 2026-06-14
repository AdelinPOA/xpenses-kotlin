package eu.nt.xpenses;

import org.springframework.aot.generate.Generated;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.RootBeanDefinition;

/**
 * Bean definitions for {@link XpensesApplication}.
 */
@Generated
public class XpensesApplication__BeanDefinitions {
  /**
   * Get the bean definition for 'xpensesApplication'.
   */
  public static BeanDefinition getXpensesApplicationBeanDefinition() {
    RootBeanDefinition beanDefinition = new RootBeanDefinition(XpensesApplication.class);
    beanDefinition.setInstanceSupplier(XpensesApplication::new);
    return beanDefinition;
  }
}
